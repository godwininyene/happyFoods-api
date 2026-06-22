const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salesController");
const { protect, restrictTo } = require("../controllers/authController");

router.use(protect);

// Product feed for POS — both roles need this
router.get("/pos-products", salesController.getPosProducts);

// Sales history — cashier sees own, admin sees all
router.get("/", salesController.getAllSales);
router.get("/:id", salesController.getOneSale);

// Checkout — both roles can process sales
router.post("/checkout", salesController.checkout);

module.exports = router;