const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const InventoryBatch = require('../models/InventoryBatch');
const Product = require('../models/Product');

// POST /api/inventory/intake
// Records a new wholesale purchase and creates the batch
exports.intakeBatch = catchAsync(async (req, res, next) => {
    const {
        // Existing product path — frontend sends productId from dropdown
        productId,
        // New product path — frontend sends these when "Add new product" is chosen
        newProduct,  // { name, SKU, category, unitWeight, description }
        supplier,
        costPrice,
        bulkQty,
        bulkUnitType,
        expiryDate,
        notes,
    } = req.body;

    // --- STEP 1: RESOLVE THE PRODUCT ---
    let product;

    if (productId) {
        // Path A: existing product selected from dropdown
        product = await Product.findById(productId);

        if (!product) {
            return next(new AppError("Selected product not found. It may have been deleted.", "", 404));
        }
        if (!product.isActive) {
            return next(new AppError("Cannot intake a batch for a deactivated product. Reactivate it first.", "", 400));
        }

    } else if (newProduct) {
        // Path B: new product — check SKU doesn't already exist first
        const skuExists = await Product.findOne({ SKU: newProduct.SKU?.toUpperCase() });

        if (skuExists) {
            return next(
                new AppError(
                    `A product with SKU "${newProduct.SKU}" already exists. Select it from the dropdown instead.`,
                    "",
                    400
                )
            );
        }

        // Create the product on the fly
        product = await Product.create({
            name: newProduct.name,
            SKU: newProduct.SKU,
            category: newProduct.category,
            unitWeight: newProduct.unitWeight,
            description: newProduct.description || "",
        });

    } else {
        // Neither was provided
        return next(
            new AppError("Either select an existing product or provide new product details.", "", 400)
        );
    }


    // --- STEP 2: CREATE THE BATCH ---
    const batch = await InventoryBatch.create({
        product: product._id,
        supplier,
        costPrice,
        bulkQty,
        bulkUnitType,
        expiryDate: expiryDate || null,
        tiers: [], // explicitly empty — not sellable until converted
        intakeType: "Purchase",
        recordedBy: req.user._id,
        notes,
    });

    await batch.populate("product", "name SKU category");
    await batch.populate("recordedBy", "name role");

    res.status(201).json({
        status: "success",
        // Tell the frontend which path was taken
        // so it can update its product dropdown list if a new one was created
        productCreated: !productId,
        data: { batch }
    });
});


// POST /api/inventory/convert
// Unbundles an existing bulk batch into retail tiers
// e.g. 2 bags of garri → 34 paint buckets + 340 cups
exports.convertBatch = catchAsync(async (req, res, next) => {
    const {
        sourceBatchId,
        tiers,
        loggedSpoilage,
        notes,
    } = req.body;

    const batch = await InventoryBatch.findById(sourceBatchId);

    if (!batch) {
        return next(new AppError("Batch not found.", 404));
    }
    if (batch.status === "Depleted") {
        return next(new AppError("This batch has already been fully converted.", 400));
    }
    if (batch.status === "Expired") {
        return next(new AppError("Cannot convert an expired batch.", 400));
    }
    if (batch.intakeType === "Conversion") {
        return next(new AppError("This batch has already been through conversion.", 400));
    }

    // Validate incoming tiers
    if (!tiers || tiers.length === 0) {
        return next(new AppError("At least one output tier is required.", 400));
    }
    if (tiers.length > 2) {
        return next(new AppError("A maximum of two selling tiers is allowed.", 400));
    }

    // Replace the tiers on the existing batch
    // unitsRemaining mirrors unitsYielded at the point of conversion
    batch.tiers = tiers.map(tier => ({
        ...tier,
        unitsRemaining: tier.unitsYielded,
    }));

    // Record spoilage from the conversion process
    if (loggedSpoilage && loggedSpoilage > 0) {
        batch.loggedSpoilage += loggedSpoilage;
    }

    // Mark that this batch has been converted
    // intakeType evolves from "Purchase" → "Conversion"
    batch.intakeType = "Conversion";

    // Append conversion note to existing notes
    const conversionNote = notes || `Converted on ${new Date().toISOString().split("T")[0]}`;
    batch.notes = batch.notes
        ? `${batch.notes} | ${conversionNote}`
        : conversionNote;

    // pre-save hook recalculates status automatically
    await batch.save();

    await batch.populate("product", "name SKU category");
    await batch.populate("recordedBy", "name role");

    res.status(200).json({
        status: "success",
        message: `Batch ${batch.batchCode} successfully converted into retail stock.`,
        data: { batch }
    });
});

// GET /api/inventory
// Returns all batches with their product details
// Supports filtering by status, category, and search
exports.getAllBatches = catchAsync(async (req, res, next) => {
    const { status, category, search, productId } = req.query;

    // Build filter object dynamically
    const filter = {};

    if (status) filter.status = status;
    if (productId) filter.product = productId;

    // Build the query
    let query = InventoryBatch.find(filter)
        .populate("product", "name SKU category unitWeight")
        .populate("recordedBy", "name")
        .sort({ createdAt: -1 });

    const batches = await query;

    // Apply category and search filters post-populate
    // (since category and name live on the Product document)
    let filtered = batches;

    if (category) {
        filtered = filtered.filter(b => b.product?.category === category);
    }

    if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(b =>
            b.product?.name.toLowerCase().includes(s) ||
            b.batchCode.toLowerCase().includes(s) ||
            b.supplier.toLowerCase().includes(s)
        );
    }

    res.status(200).json({
        status: "success",
        results: filtered.length,
        data: { batches: filtered }
    });
});


// GET /api/inventory/expiring
// Returns batches expiring within the next N days (default 30)
// Used by the dashboard spoilage risk flag
exports.getExpiringBatches = catchAsync(async (req, res, next) => {
    const days = parseInt(req.query.days) || 30;
    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(today.getDate() + days);

    const batches = await InventoryBatch.find({
        expiryDate: { $gte: today, $lte: cutoff },
        status: { $nin: ["Depleted", "Expired"] }
    })
        .populate("product", "name SKU category")
        .sort({ expiryDate: 1 }); // soonest expiry first

    res.status(200).json({
        status: "success",
        results: batches.length,
        data: { batches }
    });
});

// GET /api/inventory/:id
exports.getOneBatch = catchAsync(async (req, res, next) => {
    const batch = await InventoryBatch.findById(req.params.id)
        .populate("product", "name SKU category unitWeight description")
        .populate("recordedBy", "name role");

    if (!batch) {
        return next(new AppError("No batch found with that ID.", 404));
    }

    res.status(200).json({
        status: "success",
        data: { batch }
    });
});

// PATCH /api/inventory/:id/spoilage
// Logs a spoilage incident against a specific tier of a batch
exports.logSpoilage = catchAsync(async (req, res, next) => {
    const { tierIndex, unitsLost, reason } = req.body;

    if (unitsLost === undefined || unitsLost <= 0) {
        return next(new AppError("Units lost must be a positive number.", 400));
    }

    const batch = await InventoryBatch.findById(req.params.id);
    if (!batch) {
        return next(new AppError("No batch found with that ID.", 404));
    }

    const tier = batch.tiers[tierIndex ?? 0];
    if (!tier) {
        return next(new AppError("Invalid tier index.", 400));
    }

    if (unitsLost > tier.unitsRemaining) {
        return next(
            new AppError(
                `Cannot log ${unitsLost} spoiled units. Only ${tier.unitsRemaining} units remaining in this tier.`,
                400
            )
        );
    }

    // Deduct from the tier
    tier.unitsRemaining -= unitsLost;
    batch.loggedSpoilage += unitsLost;

    // The pre-save hook will automatically recalculate status
    await batch.save();

    // Optionally write to a separate spoilage log collection
    // for the analytics module to query later
    const SpoilageLog = require('../models/SpoilageLog');
    await SpoilageLog.create({
        batch: batch._id,
        product: batch.product,
        tierName: tier.unitName,
        unitsLost,
        reason: reason || "Not specified",
        loggedBy: req.user._id,
    });

    await batch.populate("product", "name SKU category");

    res.status(200).json({
        status: "success",
        message: `${unitsLost} units of ${tier.unitName} marked as spoiled.`,
        data: { batch }
    });
});

// PATCH /api/inventory/:id
// General batch update — for correcting intake errors
// Does NOT touch tiers or unitsRemaining (those have dedicated routes)
// In inventoryBatchController.js
// Replace the existing updateBatch with this:

exports.updateBatch = catchAsync(async (req, res, next) => {
    // Fields that can never be edited directly
    const forbidden = ["product", "intakeType", "recordedBy", "batchCode"];
    forbidden.forEach(field => delete req.body[field]);

    // Handle tier quantity correction separately
    // req.body.tierCorrections = [{ tierIndex: 0, newUnitsRemaining: 40 }]
    const { tierCorrections, ...rest } = req.body;

    const batch = await InventoryBatch.findById(req.params.id);
    if (!batch) {
        return next(new AppError("No batch found with that ID.", 404));
    }

    // Apply general field updates
    Object.assign(batch, rest);

    // Apply tier quantity corrections if provided
    if (tierCorrections && Array.isArray(tierCorrections)) {
        for (const correction of tierCorrections) {
            const { tierIndex, newUnitsRemaining, newUnitsYielded } = correction;
            const tier = batch.tiers[tierIndex];

            if (!tier) {
                return next(new AppError(`Invalid tier index: ${tierIndex}`, 400));
            }
            if (newUnitsRemaining !== undefined) {
                if (newUnitsRemaining < 0) {
                    return next(new AppError("Units remaining cannot be negative.", 400));
                }
                // Safety check — remaining can't exceed yielded
                if (newUnitsRemaining > (newUnitsYielded ?? tier.unitsYielded)) {
                    return next(new AppError(
                        `Units remaining (${newUnitsRemaining}) cannot exceed units yielded (${newUnitsYielded ?? tier.unitsYielded}).`,
                        400
                    ));
                }
                tier.unitsRemaining = newUnitsRemaining;
            }
            if (newUnitsYielded !== undefined) {
                if (newUnitsYielded < 1) {
                    return next(new AppError("Units yielded must be at least 1.", 400));
                }
                tier.unitsYielded = newUnitsYielded;
            }
        }
    }

    // pre-save hook recalculates status
    await batch.save({ validateBeforeSave: true });
    await batch.populate("product", "name SKU category");

    res.status(200).json({
        status: "success",
        data: { batch }
    });
});
// PATCH /api/inventory/:id/selling-price
// Updates the selling price on a specific tier
// This does NOT affect past sales — those already recorded their price at checkout
exports.updateTierSellingPrice = catchAsync(async (req, res, next) => {
    const { tierIndex, newPrice } = req.body;

    if (newPrice === undefined || newPrice < 0) {
        return next(new AppError("A valid new price is required.", 400));
    }

    const batch = await InventoryBatch.findById(req.params.id);
    if (!batch) {
        return next(new AppError("No batch found with that ID.", 404));
    }

    const tier = batch.tiers[tierIndex ?? 0];
    if (!tier) {
        return next(new AppError("Invalid tier index.", 400));
    }

    tier.sellingPrice = newPrice;
    await batch.save({ validateBeforeSave: false });

    res.status(200).json({
        status: "success",
        message: `Selling price for ${tier.unitName} updated to ₦${newPrice.toLocaleString()}.`,
        data: { batch }
    });
});

// POST /api/inventory/:id/mark-sellable
// For products that don't need conversion math — e.g. a crate of eggs
// sold as-is. Creates a single tier where 1 bulk unit = 1 sellable unit.
// inventoryBatchController.js — new endpoint

// PATCH /api/inventory/:id/mark-sellable
// For products that don't need conversion math — e.g. a crate of eggs
// sold exactly as bought. Creates a single tier where 1 bulk unit = 1 sellable unit.
exports.markSellableAsIs = catchAsync(async (req, res, next) => {
    const { unitName, sellingPrice } = req.body;

    if (!unitName || sellingPrice === undefined || sellingPrice === null) {
        return next(new AppError("Unit name and selling price are required.", "", 400));
    }
    if (sellingPrice < 0) {
        return next(new AppError("Selling price cannot be negative.", "", 400));
    }

    const batch = await InventoryBatch.findById(req.params.id);
    if (!batch) {
        return next(new AppError("Batch not found.", "", 404));
    }
    if (batch.intakeType === "Conversion") {
        return next(new AppError("This batch has already been converted.", "", 400));
    }

    batch.tiers = [{
        unitName,
        unitsYielded: batch.bulkQty,
        unitsRemaining: batch.bulkQty,
        sellingPrice,
        baseUnitsPerTier: 1,
    }];
    batch.intakeType = "Conversion";
    batch.notes = batch.notes
        ? `${batch.notes} | Marked sellable as-is on ${new Date().toLocaleDateString("en-NG")}`
        : `Marked sellable as-is on ${new Date().toLocaleDateString("en-NG")}`;

    await batch.save();
    await batch.populate("product", "name SKU category");

    res.status(200).json({
        status: "success",
        data: { batch },
    });
});