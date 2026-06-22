const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const Product = require('./../models/Product');

exports.createProduct = catchAsync(async (req, res, next) => {
    // Cloudinary URL is now available in req.file.path
    if (req.file) {
        req.body.coverImage = req.file.path; // Cloudinary URL
    }
    const product = await Product.create(req.body)

    res.status(201).json({
        status: "success",
        data: {
            product
        }
    })
})

exports.getAllProducts = catchAsync(async (req, res, next) => {
    const filter = req.query.includeInactive === "true"
        ? {}
        : { isActive: true };

    const products = await Product.find(filter).sort({ createdAt: -1 });
    
    res.status(200).json({
        status: "success",
        result: products.length,
        data: {
            products
        }
    })
});

exports.getOneProduct = catchAsync(async (req, res, next) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        return next(new AppError("No product found with that ID", "", 404));
    }

    res.status(200).json({
        status: "success",
        data: { product }
    });
});


// GET /api/products/search?q=garri
// Powers the searchable dropdown in the intake form
exports.searchProducts = catchAsync(async (req, res, next) => {
    const query = req.query.q;

    if (!query) {
        return next(new AppError("Search query is required", 400));
    }

    const products = await Product.find({
        isActive: true,
        $or: [
            { name: { $regex: query, $options: "i" } },
            { SKU: { $regex: query, $options: "i" } },
        ],
    })
        .limit(10)  // cap results for dropdown performance
        .sort({ name: 1 });

    res.status(200).json({
        status: "success",
        results: products.length,
        data: { products }
    });
});

exports.updateProduct = catchAsync(async (req, res, next) => {
    // Guard: prevent accidental reactivation through a general update
    // isActive should only be toggled through the dedicated route below
    delete req.body.isActive;

    // Cloudinary URL is now available in req.file.path
    if (req.file) {
        req.body.coverImage = req.file.path; // Cloudinary URL
    }
    const product = await Product.findByIdAndUpdate(
        req.params.id,
        req.body,
        { runValidators: true, new: true }
    );

    if (!product) {
        return next(new AppError("No product found with that ID", '', 404));
    }

    res.status(200).json({
        status: "success",
        data: { product }
    });
});

// PATCH /api/products/:id/status
// Dedicated route for toggling active/inactive
// Prevents hard deletes that would orphan inventory batches
exports.toggleProductStatus = catchAsync(async (req, res, next) => {
    const product = await Product.findById(req.params.id);

    if (!product) {
        return next(new AppError("No product found with that ID", 404));
    }

    product.isActive = !product.isActive;
    await product.save({ validateBeforeSave: false });

    res.status(200).json({
        status: "success",
        message: `Product ${product.isActive ? "reactivated" : "deactivated"} successfully`,
        data: { product }
    });
});
// Only allowed if NO inventory batches reference this product
exports.deleteProduct = catchAsync(async (req, res, next) => {
    const InventoryBatch = require('../models/InventoryBatch');

    const hasBatches = await InventoryBatch.exists({ product: req.params.id });

    if (hasBatches) {
        return next(
            new AppError(
                "Cannot delete a product that has inventory batch history. Deactivate it instead.",
                "",
                400
            )
        );
    }

    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
        return next(new AppError("No product found with that ID", "", 404));
    }

    res.status(204).json({ data: null });
});