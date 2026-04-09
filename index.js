const express = require('express');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// PostgreSQL (fly.io fournit DATABASE_URL automatiquement si postgres attaché)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // nécessaire sur fly.io
});

// Création de la table au démarrage
pool.query(`
  CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    nom TEXT,
    email TEXT,
    telephone TEXT,
    message TEXT,
    date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => console.error('Erreur création table:', err));

// Mot de passe admin (à définir via secret)
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('mon_mot_de_passe', 10);

// Configuration email (secrets)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Page d'accueil
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Contact</title></head>
    <body style="font-family: sans-serif; max-width: 500px; margin: 50px auto;">
      <h1>Contactez-nous</h1>
      <form action="/submit" method="POST">
        <label>Nom :</label><br>
        <input type="text" name="nom" required><br><br>
        <label>Email :</label><br>
        <input type="email" name="email" required><br><br>
        <label>Téléphone :</label><br>
        <input type="tel" name="telephone"><br><br>
        <label>Message :</label><br>
        <textarea name="message" rows="5" required></textarea><br><br>
        <button type="submit">Envoyer</button>
      </form>
    </body>
    </html>
  `);
});

// Traitement du formulaire
app.post('/submit', async (req, res) => {
  const { nom, email, telephone, message } = req.body;
  try {
    await pool.query(
      `INSERT INTO contacts (nom, email, telephone, message) VALUES ($1, $2, $3, $4)`,
      [nom, email, telephone, message]
    );
    // Envoi d'email (optionnel)
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Merci pour votre message',
        text: `Bonjour ${nom},\n\nNous avons bien reçu votre message.\n\nCordialement,\nL'équipe`
      };
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) console.error('Erreur envoi email:', error);
        else console.log('Email envoyé: ' + info.response);
      });
    }
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>Merci</title></head>
      <body style="font-family: sans-serif; text-align: center; margin-top: 100px;">
        <h1>Merci pour votre message !</h1>
        <p>Nous vous répondrons rapidement.</p>
        <a href="/">Retour à l'accueil</a>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l\'enregistrement.');
  }
});

// Page admin (mot de passe)
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Admin</title></head>
    <body style="font-family: sans-serif; max-width: 500px; margin: 50px auto;">
      <h1>Accès restreint</h1>
      <form action="/admin" method="POST">
        <label>Mot de passe :</label><br>
        <input type="password" name="password" required><br><br>
        <button type="submit">Se connecter</button>
      </form>
    </body>
    </html>
  `);
});

app.post('/admin', async (req, res) => {
  const { password } = req.body;
  if (!bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    return res.send('<h1>Mot de passe incorrect</h1><a href="/admin">Réessayer</a>');
  }
  try {
    const result = await pool.query(`SELECT * FROM contacts ORDER BY date_inscription DESC`);
    const rows = result.rows;
    let html = `<!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>Liste des contacts</title></head>
      <body><h1>Liste des contacts</h1>
      <table border="1"><tr><th>ID</th><th>Nom</th><th>Email</th><th>Téléphone</th><th>Message</th><th>Date</th></tr>`;
    rows.forEach(row => {
      html += `<tr>
        <td>${row.id}</td>
        <td>${row.nom}</td>
        <td>${row.email}</td>
        <td>${row.telephone || ''}</td>
        <td>${row.message}</td>
        <td>${row.date_inscription}</td>
      </tr>`;
    });
    html += `}</table><br><a href="/admin">Retour</a></body></html>`;
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur base de données');
  }
});

// Démarrer le serveur
app.listen(port, '0.0.0.0', () => {
  console.log(`Serveur démarré sur http://0.0.0.0:${port}`);
});
