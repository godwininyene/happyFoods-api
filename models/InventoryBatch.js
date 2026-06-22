const mongoose = require('mongoose')

const conversionTierSchema = new mongoose.Schema(
    {
        unitName: {
            // e.g. "Paint Bucket", "Cup"
            type: String,
            required: true,
            trim: true,
        },
        unitsYielded: {
            // How many of this unit were produced from this batch
            type: Number,
            required: true,
            min: 0,
        },
        unitsRemaining: {
            // Decrements as sales happen
            type: Number,
            required: true,
            min: 0,
        },
        sellingPrice: {
            // Price per unit at the time of this batch intake
            // Stored here so old sales records remain accurate
            // even if price changes in a future batch
            type: Number,
            required: true,
            min: 0,
        },
        baseUnitsPerTier: {
            // How many of the smallest unit does this tier contain?
            // Tier 1 (Paint Bucket) = 18 if each bucket holds 18 cups
            // Tier 2 (Cup) = 1 always — it IS the base unit
            // If only one tier exists, set this to 1
            type: Number,
            default: 1,
            min: 1,
        }

    },
    { _id: false } // no separate ID needed for sub-documents
);

const inventoryBatchSchema = new mongoose.Schema(
    {
        batchCode: {
            // Auto-generated e.g. "B-2901" — useful for display
            type: String,
            unique: true,
            trim: true,
        },

        // Links back to the master product
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: [true, "Product reference is required"],
        },

        // Supplier for this specific purchase
        supplier: {
            type: String,
            required: [true, "Supplier name is required"],
            trim: true,
        },

        // What the owner paid for the entire batch
        costPrice: {
            type: Number,
            required: [true, "Cost price is required"],
            min: 0,
        },

        // How many wholesale units were purchased
        // e.g. 2 bags, 5 crates, 3 heaps
        bulkQty: {
            type: Number,
            required: [true, "Bulk quantity is required"],
            min: 1,
        },

        bulkUnitType: {
            // e.g. "Bag", "Crate", "Heap"
            type: String,
            required: true,
            trim: true,
        },

        // conditionally required — only Conversion batches need tiers
        // The retail tiers produced from this batch
        // Tier 1 is always present (e.g. Paint Bucket)
        // Tier 2 is optional (e.g. Cup)
        tiers: {
            type: [conversionTierSchema],
            validate: {
                validator: function (val) {
                    if (this.intakeType === "Purchase") return val.length === 0;
                    return val.length >= 1 && val.length <= 2;
                },
                message: "Converted batches must have between 1 and 2 selling tiers; unconverted batches should have none.",
            },
        },
        // Units lost during conversion or storage
        loggedSpoilage: {
            type: Number,
            default: 0,
            min: 0,
        },

        expiryDate: {
            type: Date,
            default: null, // null means non-perishable
        },

        status: {
            type: String,
            enum: ["Healthy", "Low Stock", "Expiring Soon", "Expired", "Depleted"],
            default: "Healthy",
        },

        // Who recorded this intake
        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Whether this batch was created from conversion
        // (wholesale purchase) or internal unbundling
        intakeType: {
            type: String,
            enum: ["Purchase", "Conversion"],
            default: "Purchase",
        },

        notes: {
            type: String,
            trim: true,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

// Auto-generate batchCode before saving if not provided
inventoryBatchSchema.pre("save", async function () {
    if (!this.batchCode) {
        const count = await mongoose.model("InventoryBatch").countDocuments();
        this.batchCode = `B-${String(count + 1).padStart(4, "0")}`;
    }
});

// Auto-update status based on stock levels and expiry
inventoryBatchSchema.pre("save", function () {
    const today = new Date();

    // Check expiry first
    if (this.expiryDate) {
        const daysLeft = Math.ceil((this.expiryDate - today) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 0) {
            this.status = "Expired";
            return;
        }
        if (daysLeft <= 7) {
            this.status = "Expiring Soon";
            return;
        }
    }

    // Purchase batches have no tiers yet by design — they're raw bulk stock
    // waiting to be converted. They're "Healthy" by default, not "Depleted",
    // since zero tiers here means "not converted yet", not "sold out"
    if (this.intakeType === "Purchase") {
        this.status = "Healthy";
        return;
    }

    // From here on, this is a Conversion batch — tiers should exist,
    // and zero remaining genuinely means sold out
    const totalRemaining = this.tiers.reduce(
        (sum, tier) => sum + tier.unitsRemaining, 0
    );

    if (totalRemaining === 0) {
        this.status = "Depleted";
    } else if (totalRemaining <= 5) {
        this.status = "Low Stock";
    } else {
        this.status = "Healthy";
    }
});
// Virtual: cost per bulk unit (useful for profit calculations)
inventoryBatchSchema.virtual("costPerBulkUnit").get(function () {
    return this.bulkQty > 0 ? this.costPrice / this.bulkQty : 0;
});

// Index for fast product-based queries
// e.g. "give me all batches of Garri"
inventoryBatchSchema.index({ product: 1, createdAt: -1 });
inventoryBatchSchema.index({ status: 1 });
inventoryBatchSchema.index({ expiryDate: 1 });

const InventoryBatch = mongoose.model("InventoryBatch", inventoryBatchSchema);
module.exports = InventoryBatch;