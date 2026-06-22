const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const AppError = require('./appError');
const { cloudinary } = require('./cloudinary');

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: (req, file) => {
      // Determine folder based on field name
      if (file.fieldname === 'coverImage') {
        return 'happyFoods/products';
      } else if (file.fieldname === 'photo') {
        return 'happyFoods/users';
      }
      return 'happyFoods/misc';
    },
    format: async (req, file) => {
      // Convert to webp for better compression, or keep original format
      return 'webp'; // or 'png', 'jpg' based on your preference
    },
    public_id: (req, file) => {
      // Generate unique filename
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      return `${file.fieldname}-${uniqueSuffix}`;
    },
    transformation: [
      { width: 800, height: 600, crop: "limit" }, // Resize for optimal delivery
      { quality: "auto" }, // Auto optimize quality
      { format: "webp" } // Convert to webp
    ]
  },
});

// Alternative storage configuration with more control:
const storageAdvanced = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Dynamic parameters based on file type and field
    const folder = file.fieldname === 'coverImage' 
      ? 'happyFoods/products' 
      : 'happyFoods/users';
    
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const publicId = `${file.fieldname}-${uniqueSuffix}`;
    
    return {
      folder: folder,
      public_id: publicId,
      format: 'webp', // Convert all images to webp
      transformation: [
        { width: 1200, height: 800, crop: "limit" }, // Limit size for products
        { quality: "auto:good" }, // Good quality with auto optimization
      ]
    };
  },
});

// File filter with detailed error messages
const fileFilter = (req, file, cb) => {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (file.fieldname === 'coverImage' || file.fieldname === 'photo') {
        if (!allowedImageTypes.includes(file.mimetype)) {
            const field = `${file.fieldname === 'coverImage' ? 'coverImage' :'photo'}`
            return cb(new AppError(
                'Invalid file type', 
                { [field]: `${file.fieldname === 'coverImage' ? 'Cover image' :'photo'} must be an image (JPEG, PNG, JPG)` }, 
                400
            ), false);
        }
    }
    
    cb(null, true);
};

// Configure multer upload with Cloudinary storage
const upload = multer({
    storage: storage, // Using Cloudinary storage instead of disk storage
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Enhanced error handling middleware
exports.handleUploadErrors = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            // Determine which field exceeded size limit
            const field = err.field === 'coverImage' ? 'coverImage' : 'photo';
            return next(new AppError(
                'File too large',
                { [field]: 'File size too large. Max 5MB allowed' },
                400
            ));
        }
        // Handle other multer errors
        return next(new AppError(
            'File upload error',
            { [err.field]: err.message },
            400
        ));
    } else if (err instanceof AppError) {
        // Already formatted AppError
        return next(err);
    }
    // Unknown error
    next(err);
};

// Export upload middleware
exports.uploadUserPhoto = upload.single('photo');
exports.uploadProductCoverImage = upload.single('coverImage');

// Helper function to get Cloudinary URL (if needed elsewhere)
exports.getCloudinaryUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    secure: true,
    ...options
  });
};