const mongoose = require('mongoose')

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Product name is required"],
            trim: true,
        },
        SKU: {
            type: String,
            required: [true, "SKU is required"],
            unique: true,
            uppercase: true,
            trim: true,
        },
        category: {
            type: String,
            required: [true, "Category is required"],
            // enum: ["Grains & Rice", "Flour & Tubers", "Oils & Liquids", "Spices & Packaged"],
        },
        unitWeight: {
            // The standard unit this product is measured in
            // e.g. "kg", "litre", "piece"
            type: String,
            required: [true, "Unit weight/measure is required"],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        isActive: {
            // Soft delete — lets admin deactivate a product 
            // without deleting its batch history
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true, // adds createdAt and updatedAt automatically
    }
);

// Index for fast name search in the intake dropdown
productSchema.index({ name: "text", SKU: "text" });

const Product = mongoose.model("Product", productSchema);
module.exports= Product;