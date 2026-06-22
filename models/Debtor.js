const mongoose = require("mongoose");

const debtorTransactionSchema = new mongoose.Schema(
    {
        sale: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Sale",
            default: null,
        },
        type: {
            // "Purchase" when credit sale is recorded
            // "Payment" when they pay back
            type: String,
            enum: ["Purchase", "Payment"],
            required: true,
        },
        amount: {
            // Positive for purchases, negative for payments
            type: Number,
            required: true,
        },
        note: {
            type: String,
            default: "",
        },
        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

const debtorSchema = new mongoose.Schema(
    {
        customerName: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true,
        },
        phone: {
            type: String,
            required: [true, "Phone number is required"],
            trim: true,
        },
        totalOwed: {
            type: Number,
            default: 0,
            min: 0,
        },
        transactions: [debtorTransactionSchema],
        status: {
            type: String,
            enum: ["Active", "Overdue", "Critical", "Settled"],
            default: "Active",
        },
        lastTransactionDate: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// Auto-update status based on totalOwed and last activity
debtorSchema.pre("save", function () {
    if (this.totalOwed === 0) {
        this.status = "Settled";
    }
    if (this.lastTransactionDate) {
        const daysSinceLastActivity = Math.floor(
            (Date.now() - this.lastTransactionDate) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceLastActivity >= 30) this.status = "Critical";
        else if (daysSinceLastActivity >= 14) this.status = "Overdue";
        else this.status = "Active";
    }
});

debtorSchema.index({ customerName: "text" });
debtorSchema.index({ status: 1 });

const Debtor = mongoose.model("Debtor", debtorSchema);
module.exports = Debtor;