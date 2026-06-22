const mongoose = require('mongoose');

const spoilageLogSchema = new mongoose.Schema(
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
        tierName: {
            // e.g. "Paint Bucket", "Cup"
            type: String,
            required: true,
        },
        unitsLost: {
            type: Number,
            required: true,
            min: 1,
        },
        reason: {
            type: String,
            trim: true,
            default: "Not specified",
        },
        loggedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

spoilageLogSchema.index({ product: 1, createdAt: -1 });
spoilageLogSchema.index({ batch: 1 });

const SpoilageLog = mongoose.model("SpoilageLog", spoilageLogSchema);
module.exports = SpoilageLog;