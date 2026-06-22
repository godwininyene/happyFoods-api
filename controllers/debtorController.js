const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const Debtor = require("../models/Debtor");

// GET /api/debtors
exports.getAllDebtors = catchAsync(async (req, res, next) => {
    const { status, search } = req.query;
    const filter = {};
    if (status) filter.status = status;

    let debtors = await Debtor.find(filter).sort({ totalOwed: -1 });

    if (search) {
        const s = search.toLowerCase();
        debtors = debtors.filter(d =>
            d.customerName.toLowerCase().includes(s) ||
            d.phone.includes(s)
        );
    }

    res.status(200).json({
        status: "success",
        results: debtors.length,
        data: { debtors },
    });
});

// GET /api/debtors/:id
exports.getOneDebtor = catchAsync(async (req, res, next) => {
    const debtor = await Debtor.findById(req.params.id)
        .populate("transactions.recordedBy", "name");

    if (!debtor) {
        return next(new AppError("Debtor not found.", "", 404));
    }

    res.status(200).json({
        status: "success",
        data: { debtor },
    });
});

// POST /api/debtors
exports.createDebtor = catchAsync(async (req, res, next) => {
    const { customerName, phone } = req.body;

    const exists = await Debtor.findOne({ phone });
    if (exists) {
        return next(new AppError("A debtor with this phone number already exists.", "", 400));
    }

    const debtor = await Debtor.create({ customerName, phone });

    res.status(201).json({
        status: "success",
        data: { debtor },
    });
});

// POST /api/debtors/:id/payment
// Records a partial or full payment from a debtor
exports.recordPayment = catchAsync(async (req, res, next) => {
    const { amount, paymentMethod, note } = req.body;

    if (!amount || amount <= 0) {
        return next(new AppError("Payment amount must be greater than zero.", "", 400));
    }

    const debtor = await Debtor.findById(req.params.id);
    if (!debtor) {
        return next(new AppError("Debtor not found.", "", 404));
    }
    if (amount > debtor.totalOwed) {
        return next(
            new AppError(
                `Payment of ₦${amount.toLocaleString()} exceeds outstanding balance of ₦${debtor.totalOwed.toLocaleString()}.`,
                "",
                400
            )
        );
    }

    debtor.totalOwed -= amount;
    debtor.lastTransactionDate = new Date();
    debtor.transactions.push({
        type: "Payment",
        amount: -amount,
        note: note || `Payment via ${paymentMethod || "Cash"}`,
        recordedBy: req.user._id,
    });

    await debtor.save();

    res.status(200).json({
        status: "success",
        message: `Payment of ₦${amount.toLocaleString()} recorded. Remaining balance: ₦${debtor.totalOwed.toLocaleString()}.`,
        data: { debtor },
    });
});