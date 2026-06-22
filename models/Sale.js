const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
    {
        batch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "InventoryBatch",
            required: true,
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        productName: {
            // Snapshot at time of sale — product name shouldn't change
            type: String,
            required: true,
        },
        tierIndex: {
            // Which tier was sold — 0 = Paint Bucket, 1 = Cup
            type: Number,
            required: true,
            default: 0,
        },
        unitName: {
            // e.g. "Paint Bucket" — snapshot so records stay accurate
            type: String,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        unitPrice: {
            // Price at time of sale — not affected by future price changes
            type: Number,
            required: true,
            min: 0,
        },
        lineTotal: {
            type: Number,
            required: true,
            min: 0,
        },
        //cost per unit at time of sale, snapshot so it stays accurate historically
        unitCost: {
            type: Number,
            default: 0,
            min: 0,
        },
        //total cost for this line item (unitCost × quantity)
        lineCost: {
            type: Number,
            default: 0,
            min: 0,
        },
        //profit for this specific line item (lineTotal - lineCost)
        lineProfit: {
            type: Number,
            default: 0,
        },
    },
    { _id: false }
);

const saleSchema = new mongoose.Schema(
    {
        invoiceId: {
            type: String,
            unique: true,
        },
        cashier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        items: {
            type: [saleItemSchema],
            validate: {
                validator: val => val.length >= 1,
                message: "A sale must have at least one item.",
            },
        },
        grossTotal: {
            type: Number,
            required: true,
            min: 0,
        },
        costBasis: {
            // Sum of cost prices across items — used for profit calculation
            type: Number,
            default: 0,
        },
        profit: {
            type: Number,
            default: 0,
        },
        paymentMethod: {
            type: String,
            enum: ["Cash", "POS Terminal", "Transfer", "Credit"],
            required: true,
        },
        debtor: {
            // Only populated when paymentMethod is Credit
            type: mongoose.Schema.Types.ObjectId,
            ref: "Debtor",
            default: null,
        },
        status: {
            type: String,
            enum: ["Settled", "Debt Pending"],
            default: "Settled",
        },
        notes: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

// Auto-generate invoice ID before saving
saleSchema.pre("save", async function () {
    if (!this.invoiceId) {
        const count = await mongoose.model("Sale").countDocuments();
        this.invoiceId = `HF-${String(count + 1).padStart(6, "0")}`;
    }
});

saleSchema.index({ cashier: 1, createdAt: -1 });
saleSchema.index({ status: 1 });
saleSchema.index({ createdAt: -1 });

const Sale = mongoose.model("Sale", saleSchema);
module.exports = Sale;