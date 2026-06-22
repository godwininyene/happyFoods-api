const express = require('express');
const router = express.Router();
const productController = require('./../controllers/productController');
const authController = require('./../controllers/authController');
const { uploadProductCoverImage } = require('../utils/multerConfig');

router.get("/search", productController.searchProducts);

// Protect all routes below
router.use(authController.protect);

router.get('/', productController.getAllProducts)

//Restrict all routes below to admin only
router.use(authController.restrictTo('admin'))

router.post('/', uploadProductCoverImage, productController.createProduct)
  
router
    .route("/:id")
    .get(productController.getOneProduct)
    .patch(productController.updateProduct)
    .delete(productController.deleteProduct);

router.patch("/:id/status", productController.toggleProductStatus);

module.exports = router;