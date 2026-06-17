const express = require('express');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { validate, registerValidation, loginValidation } = require('../middlewares/validation');
const { requireAuth, generateToken } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/auth/register
router.post('/register', validate(registerValidation), async (req, res) => {
  try {
    const { email, password, companyName } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          emailContact: email,
          settings: {
            nom: companyName,
            tagline: 'Votre partenaire de confiance',
            adresse: '',
            tel: '',
            email: email,
            capital: '',
            ice: '',
            rc: '',
            patente: '',
            ifNum: '',
            cnss: '',
            rib: '',
            logo: '',
            tvaDefault: 20,
            prefixDevis: 'DEV',
            prefixFac: 'FAC',
            conditions: 'Conditions de règlement : paiement à 30 jours date de facture.\nEn cas de retard de paiement, des pénalités de 1,5% par mois seront appliquées.',
            mentions: 'SARL au capital variable'
          }
        }
      });

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          companyId: company.id,
          role: 'admin'
        }
      });

      await tx.invoiceTemplate.create({
        data: {
          companyId: company.id,
          config: {
            columns: ['ref', 'designation', 'unite', 'qte', 'prixUHT', 'totalHT', 'tva', 'totalTTC'],
            order: ['ref', 'designation', 'unite', 'qte', 'prixUHT', 'totalHT', 'tva', 'totalTTC'],
            customFields: [],
            logoPosition: 'left',
            numbering: {
              devisPrefix: 'DEV',
              facturePrefix: 'FAC',
              separator: '/',
              padding: 3,
              resetYearly: true
            }
          }
        }
      });

      return { company, user };
    });

    const token = generateToken(result.user.id, result.company.id, result.user.role);

    res.status(201).json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        company: {
          id: result.company.id,
          name: result.company.name
        }
      }
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
});

// POST /api/auth/login
router.post('/login', validate(loginValidation), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const token = generateToken(user.id, user.companyId, user.role);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        company: {
          id: user.company.id,
          name: user.company.name
        }
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { company: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      company: {
        id: user.company.id,
        name: user.company.name,
        settings: user.company.settings
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;