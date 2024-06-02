import express from 'express';
import knex from 'knex';
import cors from 'cors';
import bcrypt from 'bcrypt';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
const app = express();
const port = 3000;




app.use(session({
  secret: 'your_secret_key', // A secret key for session encoding
  httpOnly: false,
  resave: false,              // Forces the session to be saved back to the session store
  saveUninitialized: true,    // Forces a session that is "uninitialized" to be saved to the store
  cookie: { maxAge: 3600000, secure: false }   // Note: secure: true should be used in production with HTTPS
}));

app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

knex.select('*').from('utilizatori').then(console.log);

app.get('/', (req, res) => {
  res.json({
    "userId": req.session.userId,
    "userSessionId": req.session.id
  });
});

app.get('/shop', (req, res) => {
  if (req.session.userId) {
    res.send(`You are logged in as ${req.session.userId}`)
  } else {
    res.send(`You aren't logged in`);
    
  }
});

app.get('/test-session', (req, res) => {
  if (req.session.views) {
    req.session.views++;
  } else {
    req.session.views = 1;

  }
  res.status(200).send(`Hello, Views: ${req.session.views}`);
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
     knex
      .select('*')
      .from('utilizatori')
      .where('email', '=', email)
      .then(response => {
        bcrypt.compare(password, response[0].hash).then(function (result) {
          return result;
        }).then(isValid => {
          if (isValid) {
            req.session.userId = response[0].id;
            return res.status(200).json({ message: 'Logged in!', redirect: '/shop' });

          }
          res.status(401).send('User or password could be wrong. Try again!');
        });
      });
  } catch (err) {
    console.log(err);
  }
});



app.get('/profile', (req, res) => {
  console.log(req.session.userId);
  res.json({
    "userId": req.session.userId,
    "userSessionId": req.session.id
  });
  
});


app.post('/register', async (req, res) => {
  const { name, prenume, cnp, email, password } = req.body;

  const salt = 10;
  const hash = bcrypt.hashSync(password, salt);

 

  const newUser = knex
    .transaction(trx => {
      knex('utilizatori')
        .transacting(trx)
        .insert({
          hash: hash,
          email: email
        }, "email")
        .then(res => {
          return trx
            .insert({
              nume: name,
              prenume: prenume,
              datanasterii: new Date(),
              cnp: cnp,
              adresa: "idk",
              prenumetata: "lala",
              prenumemama: "elsa",
              email: res[0].email,
              // joined: new Date()
            }, '*')
            .into('elevi')
        })
        .then(trx.commit)
        .catch(trx.rollback)
    })
    .catch(err => {
      console.log('Error:' + err);
    });
    
  newUser.then(user => {
    res.send(user[0]);
  });
});

app.listen(port);