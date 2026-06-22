const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryBatchController');
const { protect, restrictTo } = require('../controllers/authController');

// --- GLOBAL GUARD ---
// Every single inventory route requires a valid login
// Anything below this line is protected
router.use(protect);

// --- READ ROUTES (admin + cashier) ---
// Both roles need to read inventory
// Cashier needs it to see available stock on the POS
router.get("/expiring", inventoryController.getExpiringBatches);

router
    .route("/")
    .get(inventoryController.getAllBatches);

router
    .route("/:id")
    .get(inventoryController.getOneBatch);

// --- WRITE ROUTES (admin only) ---
// Everything below this line is restricted to admin
router.use(restrictTo("admin"));

router.post("/intake", inventoryController.intakeBatch);
router.post("/convert", inventoryController.convertBatch);

router
    .route("/:id")
    .patch(inventoryController.updateBatch);

router.patch("/:id/spoilage", inventoryController.logSpoilage);
router.patch("/:id/selling-price", inventoryController.updateTierSellingPrice);
router.post('/:id/mark-sellable', inventoryController.markSellableAsIs)

module.exports = router;