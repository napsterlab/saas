const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireAuth, ensureTenant } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireAuth, ensureTenant);

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { settings: true }
    });
    res.json(company?.settings || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  try {
    const settings = req.body;
    const company = await prisma.company.update({
      where: { id: req.companyId },
      data: { settings }
    });
    res.json(company.settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;