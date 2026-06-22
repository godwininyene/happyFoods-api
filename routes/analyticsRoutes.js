const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analyticsController");
const { protect, restrictTo } = require("../controllers/authController");

router.use(protect);
router.use(restrictTo("admin")); // analytics is admin-only

router.get("/sales-trend", analyticsController.getSalesTrend);
router.get("/best-sellers", analyticsController.getBestSellers);
router.get("/low-stock-warnings", analyticsController.getLowStockWarnings);
router.get("/dead-stock", analyticsController.getDeadStock);

router.get("/dashboard-summary", analyticsController.getDashboardSummary);

module.exports = router;