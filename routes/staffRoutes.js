const express = require("express");
const router = express.Router();
const staffController = require("../controllers/staffController");
const { protect, restrictTo } = require("../controllers/authController");

router.use(protect);
router.use(restrictTo("admin"));

router.get("/", staffController.getAllStaff);
router.post("/", staffController.createStaff);
router.patch("/:id/toggle-status", staffController.toggleStaffStatus);

module.exports = router;