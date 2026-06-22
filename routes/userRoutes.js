const express = require('express');
const router = express.Router();
const userController = require('./../controllers/userController');
const authController = require('./../controllers/authController');
const { uploadUserPhoto } = require('../utils/multerConfig');

router.route('/login').post(authController.login);
router.get('/logout', authController.logout);


// Protect all routes after this middleware
router.use(authController.protect);

router.route('/updateMyPassword').patch( authController.updatePassword);
router.route('/updateMe').patch(uploadUserPhoto, userController.updateMe);
router.route('/me').get(userController.getMe, userController.getUser);


// router.route('/')
//     .post(uploadUserPhoto, userController.createUser)




module.exports = router;