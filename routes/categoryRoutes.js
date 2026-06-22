const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/categoryController");
const { protect, restrictTo } = require("../controllers/authController");

router.use(protect);
router.get("/", categoryController.getAllCategories);
router.use(restrictTo("admin"));

router.post("/", categoryController.createCategory);
router.patch("/:id", categoryController.renameCategory);
router.delete("/:id", categoryController.deleteCategory);

module.exports = router;