const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const Category = require("../models/Category");
const Product = require("../models/Product");

// GET /api/categories
exports.getAllCategories = catchAsync(async (req, res, next) => {
    const categories = await Category.find().sort({ name: 1 });

    res.status(200).json({
        status: "success",
        results: categories.length,
        data: { categories },
    });
});

// POST /api/categories
exports.createCategory = catchAsync(async (req, res, next) => {
    const { name } = req.body;


    const trimmedName = name.trim();
    // const existing = await Category.findOne({ name: trimmedName });
    // if (existing) {
    //     return next(new AppError("This category already exists.", "", 400));
    // }

    const category = await Category.create({
        name: trimmedName,
        createdBy: req.user._id,
    });

    res.status(201).json({
        status: "success",
        data: { category },
    });
});

// PATCH /api/categories/:id
// Renames a category — all products referencing it by name need updating too,
// since Product.category is currently stored as a plain string, not a reference
exports.renameCategory = catchAsync(async (req, res, next) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
        return next(new AppError("Category name is required.", "", 400));
    }

    const category = await Category.findById(req.params.id);
    if (!category) {
        return next(new AppError("Category not found.", "", 404));
    }

    const oldName = category.name;
    const newName = name.trim();

    const duplicate = await Category.findOne({ name: newName, _id: { $ne: category._id } });
    if (duplicate) {
        return next(new AppError("A category with this name already exists.", "", 400));
    }

    category.name = newName;
    await category.save();

    // Cascade the rename to every product currently using the old name
    await Product.updateMany({ category: oldName }, { category: newName });

    res.status(200).json({
        status: "success",
        data: { category },
    });
});

// DELETE /api/categories/:id
exports.deleteCategory = catchAsync(async (req, res, next) => {
    const category = await Category.findById(req.params.id);
    if (!category) {
        return next(new AppError("Category not found.", "", 404));
    }

    const productsUsingIt = await Product.countDocuments({ category: category.name });
    if (productsUsingIt > 0) {
        return next(
            new AppError(
                `Cannot delete this category — ${productsUsingIt} product${productsUsingIt !== 1 ? "s" : ""} currently use it. Reassign them first.`,
                "",
                400
            )
        );
    }

    await category.deleteOne();

    res.status(204).json({
        status: "success",
        message: "Category deleted.",
    });
});