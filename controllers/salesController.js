const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const Sale = require("../models/Sale");
const InventoryBatch = require("../models/InventoryBatch");
const Debtor = require("../models/Debtor");

// GET /api/sales/pos-products
// Returns all converted batches that have stock remaining
// This is what populates the POS product grid
exports.getPosProducts = catchAsync(async (req, res, next) => {
    const batches = await InventoryBatch.find({
        intakeType: "Conversion",
        status: { $nin: ["Depleted", "Expired"] },
    }).populate("product", "name SKU category");

    const sellableItems = [];

    batches.forEach(batch => {

        // Calculate total base units across ALL tiers
        // e.g. 34 buckets × 10 base units + 340 cups × 1 base unit = 680
        const totalBaseUnits = batch.tiers.reduce((sum, tier) => {
            return sum + (tier.unitsYielded * (tier.baseUnitsPerTier || 1));
        }, 0);

        // Cost per single base unit
        const costPerBaseUnit = totalBaseUnits > 0
            ? batch.costPrice / totalBaseUnits
            : 0;

        batch.tiers.forEach((tier, tierIndex) => {
            if (tier.unitsRemaining > 0) {
                sellableItems.push({
                    batchId: batch._id,
                    batchCode: batch.batchCode,
                    productId: batch.product._id,
                    productName: batch.product.name,
                    SKU: batch.product.SKU,
                    category: batch.product.category,
                    tierIndex,
                    unitName: tier.unitName,
                    sellingPrice: tier.sellingPrice,
                    unitsRemaining: tier.unitsRemaining,
                    // Cost for THIS tier = base unit cost × how many base units it contains
                    costPerUnit: costPerBaseUnit * (tier.baseUnitsPerTier || 1),
                });
            }
        });
    });

    res.status(200).json({
        status: "success",
        results: sellableItems.length,
        data: { products: sellableItems },
    });
});

// POST /api/sales/checkout
// Creates a sale, deducts stock, and handles credit if applicable
// This is the most critical endpoint in the entire system
exports.checkout = catchAsync(async (req, res, next) => {
    const { items, paymentMethod, debtorId, newDebtor, notes } = req.body;

    if (!items || items.length === 0) {
        return next(new AppError("Cart is empty.", "", 400));
    }

    // ── STEP 1: VALIDATE STOCK FOR ALL ITEMS BEFORE TOUCHING ANYTHING ──
    // We validate everything first so we never partially deduct stock
    const batchUpdates = [];

    for (const item of items) {
        const { batchId, tierIndex, quantity } = item;

        const batch = await InventoryBatch.findById(batchId);
        if (!batch) {
            return next(new AppError(`Batch not found for item: ${item.productName}`, "", 404));
        }

        const tier = batch.tiers[tierIndex];
        if (!tier) {
            return next(new AppError(`Invalid tier for item: ${item.productName}`, "", 400));
        }
        if (tier.unitsRemaining < quantity) {
            return next(
                new AppError(
                    `Not enough stock for ${item.productName} (${tier.unitName}). Only ${tier.unitsRemaining} left.`,
                    "",
                    400
                )
            );
        }

        batchUpdates.push({ batch, tierIndex, quantity });
    }

    // ── STEP 2: VALIDATE DEBTOR IF CREDIT SALE ──
    let debtor = null;
    if (paymentMethod === "Credit") {

        if (debtorId) {
            // Path A: existing debtor selected from dropdown
            debtor = await Debtor.findById(debtorId);
            if (!debtor) {
                return next(new AppError("Selected debtor not found.", "", 404));
            }

        } else if (newDebtor) {
            // Path B: create debtor on the fly during checkout
            // newDebtor = { customerName, phone }
            if (!newDebtor.customerName || !newDebtor.phone) {
                return next(new AppError("Customer name and phone number are required to create a new debtor.", "", 400));
            }

            // Check phone isn't already registered
            const phoneExists = await Debtor.findOne({ phone: newDebtor.phone });
            if (phoneExists) {
                return next(
                    new AppError(
                        `A debtor with phone number ${newDebtor.phone} already exists. Select them from the dropdown instead.`,
                        "",
                        400
                    )
                );
            }

            debtor = await Debtor.create({
                customerName: newDebtor.customerName,
                phone: newDebtor.phone,
            });

        } else {
            // Neither provided
            return next(
                new AppError("Please select an existing customer or provide their name and phone number for credit sales.", "", 400)
            );
        }
    }

    // ── STEP 3: BUILD SALE ITEMS AND CALCULATE TOTALS ──
    let grossTotal = 0;
    let costBasis = 0;

    const saleItems = items.map(item => {
        const lineTotal = item.unitPrice * item.quantity;
        const lineCost = (item.costPerUnit || 0) * item.quantity;
        const lineProfit = lineTotal - lineCost;

        grossTotal += lineTotal;
        costBasis += lineCost;

        return {
            batch: item.batchId,
            product: item.productId,
            productName: item.productName,
            tierIndex: item.tierIndex,
            unitName: item.unitName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal,
            unitCost: item.costPerUnit || 0,
            lineCost,
            lineProfit,
        };
    });

    // ── STEP 4: DEDUCT STOCK FROM ALL BATCHES ──
    for (const { batch, tierIndex, quantity } of batchUpdates) {
        batch.tiers[tierIndex].unitsRemaining -= quantity;
        // pre-save hook auto-recalculates status
        await batch.save();
    }

    // ── STEP 5: CREATE THE SALE RECORD ──
    const sale = await Sale.create({
        cashier: req.user._id,
        items: saleItems,
        grossTotal,
        costBasis,
        profit: grossTotal - costBasis,
        paymentMethod,
        debtor: debtor ? debtor._id : null,
        status: paymentMethod === "Credit" ? "Debt Pending" : "Settled",
        notes: notes || "",
    });

    // ── STEP 6: UPDATE DEBTOR BALANCE IF CREDIT ──
    if (debtor) {
        debtor.totalOwed += grossTotal;
        debtor.lastTransactionDate = new Date();
        debtor.transactions.push({
            sale: sale._id,
            type: "Purchase",
            amount: grossTotal,
            note: `Credit sale — Invoice ${sale.invoiceId}`,
            recordedBy: req.user._id,
        });
        await debtor.save();
    }

    await sale.populate("cashier", "name role");

    res.status(201).json({
        status: "success",
        debtorCreated: paymentMethod === "Credit" && !debtorId,
        data: { sale },
    });
});

// GET /api/sales
// Returns all sales with filters
// Cashier only sees their own sales via ?cashierId=me
exports.getAllSales = catchAsync(async (req, res, next) => {
    const { status, paymentMethod, cashierId, search } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    // Cashier role scoping — cashier only sees their own sales
    if (req.user.role === "cashier") {
        filter.cashier = req.user._id;
    } else if (cashierId) {
        filter.cashier = cashierId;
    }

    const sales = await Sale.find(filter)
        .populate("cashier", "name role")
        .populate("debtor", "customerName phone")
        .sort({ createdAt: -1 });

    let filtered = sales;
    if (search) {
        const s = search.toLowerCase();
        filtered = sales.filter(sale =>
            sale.invoiceId.toLowerCase().includes(s) ||
            sale.debtor?.customerName?.toLowerCase().includes(s)
        );
    }

    res.status(200).json({
        status: "success",
        results: filtered.length,
        data: { sales: filtered },
    });
});

// GET /api/sales/:id
exports.getOneSale = catchAsync(async (req, res, next) => {
    const sale = await Sale.findById(req.params.id)
        .populate("cashier", "name role")
        .populate("debtor", "customerName phone");

    if (!sale) {
        return next(new AppError("Sale not found.", "", 404));
    }

    // Cashier can only view their own sales
    if (req.user.role === "cashier" && sale.cashier._id.toString() !== req.user._id.toString()) {
        return next(new AppError("You do not have access to this sale.", "", 403));
    }

    res.status(200).json({
        status: "success",
        data: { sale },
    });
});