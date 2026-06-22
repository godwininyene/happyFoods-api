const express = require("express");
const router = express.Router();
const debtorController = require("../controllers/debtorController");
const { protect, restrictTo } = require("../controllers/authController");

router.use(protect);
router.use(restrictTo("admin")); // debtors are admin-only

router.get("/", debtorController.getAllDebtors);
router.post("/", debtorController.createDebtor);
router.get("/:id", debtorController.getOneDebtor);
router.post("/:id/payment", debtorController.recordPayment);

module.exports = router;