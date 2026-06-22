const catchAsync = require("../utils/catchAsync");
const Sale = require("../models/Sale");
const InventoryBatch = require("../models/InventoryBatch");

// Helper: get the most recent Monday at 00:00:00
const getStartOfWeek = () => {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // shift to Monday
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
};

// GET /api/analytics/sales-trend?period=weekly
// Returns daily sales + profit totals for charting
exports.getSalesTrend = catchAsync(async (req, res, next) => {
    const period = req.query.period || "weekly";
    //for daily, this shows today and yesterday data
    //const daysBack = period === "daily" ? 1 : period === "monthly" ? 30 : 7;

    //for daily, this shows only today data
    const daysBack = period === "daily" ? 0 : period === "monthly" ? 30 : 7;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    startDate.setHours(0, 0, 0, 0);

    const sales = await Sale.find({ createdAt: { $gte: startDate } });

    // Group by day — now also separating credit sales from settled sales
    const grouped = {};
    sales.forEach(sale => {
        const dayKey = sale.createdAt.toISOString().split("T")[0];
        if (!grouped[dayKey]) {
            grouped[dayKey] = { date: dayKey, sales: 0, profit: 0, creditIssued: 0 };
        }
        grouped[dayKey].sales += sale.grossTotal;
        grouped[dayKey].profit += sale.profit;

        // Track how much of that day's sales were issued on credit
        // This is "money sold but not yet collected" for that day
        if (sale.paymentMethod === "Credit") {
            grouped[dayKey].creditIssued += sale.grossTotal;
        }
    });

    const trend = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json({
        status: "success",
        data: { trend },
    });
});

// GET /api/analytics/best-sellers
// Returns products ranked by quantity sold and profit, aggregated from sale items
exports.getBestSellers = catchAsync(async (req, res, next) => {
    const limit = parseInt(req.query.limit) || 10;

    const sales = await Sale.find();

    // Aggregate by product + unit name (since Paint Bucket and Cup are different sellable units)
    const productMap = {};

    sales.forEach(sale => {
        sale.items.forEach(item => {
            const key = `${item.productName}-${item.unitName}`;
            if (!productMap[key]) {
                productMap[key] = {
                    productName: item.productName,
                    unitName: item.unitName,
                    unitsSold: 0,
                    revenue: 0,
                    profit: 0,
                };
            }
            productMap[key].unitsSold += item.quantity;
            productMap[key].revenue += item.lineTotal;
            productMap[key].profit += item.lineProfit || 0;
        });
    });

    const ranked = Object.values(productMap)
        .map(p => ({
            ...p,
            margin: p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : "0",
        }))
        .sort((a, b) => b.unitsSold - a.unitsSold)
        .slice(0, limit);

    res.status(200).json({
        status: "success",
        results: ranked.length,
        data: { bestSellers: ranked },
    });
});

// GET /api/analytics/low-stock-warnings
// Reuses the same low-stock detection from inventory, formatted for the analytics view
exports.getLowStockWarnings = catchAsync(async (req, res, next) => {
    const threshold = parseInt(req.query.threshold) || 10;

    const batches = await InventoryBatch.find({
        status: { $in: ["Healthy", "Low Stock"] },
        intakeType: "Conversion",
    }).populate("product", "name");

    const warnings = [];
    batches.forEach(batch => {
        batch.tiers.forEach(tier => {
            if (tier.unitsRemaining <= threshold && tier.unitsRemaining > 0) {
                warnings.push({
                    batchCode: batch.batchCode,
                    productName: batch.product.name,
                    unitName: tier.unitName,
                    unitsRemaining: tier.unitsRemaining,
                    severity: tier.unitsRemaining <= threshold / 2 ? "Critical" : "Warning",
                });
            }
        });
    });

    res.status(200).json({
        status: "success",
        results: warnings.length,
        data: { warnings },
    });
});

// GET /api/analytics/dead-stock
// Products with zero sales activity in the last N days, but stock still sitting
exports.getDeadStock = catchAsync(async (req, res, next) => {
    const days = parseInt(req.query.days) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Get all converted batches with remaining stock
    const batches = await InventoryBatch.find({
        intakeType: "Conversion",
        status: { $nin: ["Depleted", "Expired"] },
    }).populate("product", "name");

    // Get all sales since cutoff to know what HAS moved
    const recentSales = await Sale.find({ createdAt: { $gte: cutoff } });
    const recentlySoldBatchIds = new Set();
    recentSales.forEach(sale => {
        sale.items.forEach(item => {
            recentlySoldBatchIds.add(item.batch.toString());
        });
    });

    const deadStock = [];
    batches.forEach(batch => {
        const hasRecentSale = recentlySoldBatchIds.has(batch._id.toString());
        const totalRemaining = batch.tiers.reduce((sum, t) => sum + t.unitsRemaining, 0);

        if (!hasRecentSale && totalRemaining > 0) {
            const daysSinceCreated = Math.floor((Date.now() - batch.createdAt) / (1000 * 60 * 60 * 24));
            // Estimate tied-up value using remaining stock × selling price
            const tiedUpValue = batch.tiers.reduce(
                (sum, t) => sum + (t.unitsRemaining * t.sellingPrice), 0
            );

            deadStock.push({
                productName: batch.product.name,
                batchCode: batch.batchCode,
                daysSinceCreated,
                tiedUpValue,
                unitsRemaining: totalRemaining,
            });
        }
    });

    deadStock.sort((a, b) => b.daysSinceCreated - a.daysSinceCreated);

    res.status(200).json({
        status: "success",
        results: deadStock.length,
        data: { deadStock },
    });
});


// GET /api/analytics/dashboard-summary
// Powers the admin dashboard — quick KPIs + category breakdown
exports.getDashboardSummary = catchAsync(async (req, res, next) => {
    const Debtor = require("../models/Debtor");

    const startOfThisWeek = getStartOfWeek();

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    // This week's sales (Monday 00:00 → now)
    const thisWeekSales = await Sale.find({ createdAt: { $gte: startOfThisWeek } });

    // Last full week's sales (Monday → the following Monday) for comparison
    const lastWeekSales = await Sale.find({
        createdAt: { $gte: startOfLastWeek, $lt: startOfThisWeek }
    });

    const thisWeekRevenue = thisWeekSales.reduce((sum, s) => sum + s.grossTotal, 0);
    const lastWeekRevenue = lastWeekSales.reduce((sum, s) => sum + s.grossTotal, 0);
    const revenueChange = lastWeekRevenue > 0
        ? (((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100).toFixed(1)
        : 0;

    // ── Build the Mon–Sun trend, including days with zero sales ──
    // This ensures the chart always shows all 7 days of the week,
    // even if today is only Wednesday (remaining days just show as 0)
    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const trendMap = {};

    dayLabels.forEach((_, index) => {
        const dayDate = new Date(startOfThisWeek);
        dayDate.setDate(dayDate.getDate() + index);
        const key = dayDate.toISOString().split("T")[0];
        trendMap[key] = { date: key, sales: 0, profit: 0, creditIssued: 0 };
    });

    thisWeekSales.forEach(sale => {
        const dayKey = sale.createdAt.toISOString().split("T")[0];
        if (trendMap[dayKey]) {
            trendMap[dayKey].sales += sale.grossTotal;
            trendMap[dayKey].profit += sale.profit;
            if (sale.paymentMethod === "Credit") {
                trendMap[dayKey].creditIssued += sale.grossTotal;
            }
        }
    });

    const trend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

    // ── Outstanding credit (live figure) ──
    const debtors = await Debtor.find();
    const totalOwed = debtors.reduce((sum, d) => sum + d.totalOwed, 0);

    // ── Stock distribution by category ──
    const batches = await InventoryBatch.find({
        intakeType: "Conversion",
        status: { $nin: ["Depleted", "Expired"] },
    }).populate("product", "category");

    const categoryTotals = {};
    let totalUnitsInStock = 0;

    batches.forEach(batch => {
        const category = batch.product?.category || "Uncategorized";
        const batchUnits = batch.tiers.reduce((sum, t) => sum + t.unitsRemaining, 0);
        categoryTotals[category] = (categoryTotals[category] || 0) + batchUnits;
        totalUnitsInStock += batchUnits;
    });

    const stockByCategory = Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));

    // ── Expiring soon flag ──
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringSoonCount = await InventoryBatch.countDocuments({
        expiryDate: { $gte: new Date(), $lte: sevenDaysFromNow },
        status: { $nin: ["Depleted", "Expired"] },
    });

    res.status(200).json({
        status: "success",
        data: {
            grossRevenue: thisWeekRevenue,
            revenueChange: parseFloat(revenueChange),
            outstandingCredit: totalOwed,
            totalUnitsInStock,
            stockByCategory,
            expiringSoonCount,
            trend, // now included directly in dashboard-summary
        },
    });
});