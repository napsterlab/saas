const { body, validationResult } = require('express-validator');

exports.validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    res.status(400).json({ 
      errors: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  };
};

// Validateurs
exports.registerValidation = [
  body('email').isEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit faire au moins 6 caractères'),
  body('companyName').notEmpty().withMessage('Le nom de la société est requis')
];

exports.loginValidation = [
  body('email').isEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Le mot de passe est requis')
];

exports.clientValidation = [
  body('nom').notEmpty().withMessage('Le nom est requis'),
  body('type').optional().isIn(['Particulier', 'Entreprise', 'Administration']).withMessage('Type invalide')
];

exports.fournisseurValidation = [
  body('nom').notEmpty().withMessage('Le nom est requis')
];

exports.productValidation = [
  body('designation').notEmpty().withMessage('La désignation est requise'),
  body('prixHT').isNumeric().withMessage('Le prix doit être un nombre')
];

exports.documentValidation = [
  body('clientId').notEmpty().withMessage('Le client est requis'),
  body('lignes').isArray().withMessage('Les lignes doivent être un tableau')
];