import express from 'express';
import knex from 'knex';
import cors from 'cors';
import bcrypt from 'bcrypt';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
const app = express();
const port = 3000;




app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

app.use(session({
  secret: 'your_secret_key', 
  resave: false,              
  saveUninitialized: true,    
  cookie: {
    maxAge: 3600000,
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'Lax'
  }
}));

const logOperation = async (idutz, operatiune) => {
  try {
    await knex('jurnalizare').insert({
      idutz,
      operatiune,
      dataora: new Date()
    });
  } catch (error) {
    console.error('Error logging operation:', error);
  }
};

app.get('/', (req, res) => {
  console.log(req.session);
  res.json({
    "userId": req.session.userId,
    "userSessionId": req.session.id
  });
  logOperation(req.session.userId, 'accesare dashboard');
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
  const { email, password, remember } = req.body;
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
            req.session.userId = response[0].id_utilizator;
            req.session.userEmail = response[0].email;
            req.session.calitate = response[0].calitate;

            logOperation(response[0].id_utilizator, 'logare in aplicatie');

            if (remember) {
              req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
            } else {
              req.session.cookie.maxAge = 3600000;
            }

            return res.status(200).json({ message: 'Logged in!' });
          }
          res.status(401).send('User or password could be wrong. Try again!');
        });
      });
  } catch (err) {
    console.log(err);
  }
});

app.post('/logout', (req, res) => {
  const userId = req.session.userId;
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Could not log out.');
    } else {
      logOperation(userId, 'deconectare din aplicatie');
      return res.status(200).send('Logged out.');
    }
  });
});


app.get('/profile', (req, res) => {
  console.log(req.session.userId);
  res.json({
    "userId": req.session.userId,
    "userSessionId": req.session.id
  });

});


app.post('/register', async (req, res) => {
  const { firstName, lastName, cnp, email, password, address } = req.body;
  const randomMatricol = Math.floor(Math.random() * 100);
  const salt = 10;
  const hash = bcrypt.hashSync(password, salt);

  const newUser = knex
    .transaction(trx => {
      knex('utilizatori')
        .transacting(trx)
        .insert({
          hash: hash,
          email: email
        }, "id")
        .then(res => {
          const userId = res[0].id;
          return trx
            .insert({
              nrmatricol: `MAT${randomMatricol}`,
              nume: lastName,
              prenume: firstName,
              datanasterii: new Date(),
              cnp: cnp,
              adresa: address,
              email: email,
            }, '*')
            .into('elevi')
            .then(() => {
              logOperation(userId, 'adaugare utilizator nou');
            });
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

app.get('/check-session', (req, res) => {
  console.log(req.session);

  if (req.session && req.session.userEmail) {
    knex.select('*')
      .from('utilizatori')
      .where('email', '=', req.session.userEmail)
      .then(response => {
        if (response[0].calitate === 'elev') {
          knex.select('*')
            .from('elevi')
            .where('email', '=', response[0].email)
            .then(userInfo => {
              userInfo[0].calitate = response[0].calitate;
              res.json({ "loggedIn": true, "status": 200, "userInfo": userInfo });
            });
        }
        else if (response[0].calitate === 'profesor') {
          knex.select('*')
            .from('profesori')
            .where('email', '=', response[0].email)
            .then(userInfo => {
              userInfo[0].calitate = response[0].calitate;
              console.log(userInfo);
              res.json({ "loggedIn": true, "status": 200, "userInfo": userInfo });
            });
        }
        else if (response[0].calitate === 'secretar') {
          res.json({ "loggedIn": true, "status": 200, "userInfo": response[0] });
        }
        else if (response[0].calitate === 'admin') {
          res.json({ "loggedIn": true, "status": 200, "userInfo": response[0] });
        }
      })
      .catch(err => {
        console.error(err);
        res.status(500).send('Something went wrong..');
      });
  } else {
    res.status(401).json({ "loggedIn": false, "status": 401 });
  }
});
app.get('/stats', async (req, res) => {
  knex.raw(`
  SELECT
    (SELECT COUNT(*) FROM elevi) AS total_students,
    (SELECT COUNT(*) FROM profesori) AS total_professors,
    (SELECT COUNT(*)
     FROM elevi
     WHERE prenumemama IS NOT NULL AND prenumemama <> '') AS count_mothers,
    (SELECT COUNT(*)
     FROM elevi
     WHERE prenumetata IS NOT NULL AND prenumetata <> '') AS count_fathers
`)
    .then(data => {
      res.send(data.rows);
    })
    .catch(error => {
      console.error("Error:", error);
    });
})
app.get('/students', async (req, res) => {
  try {
    const rows = await knex('elevi')
      .select(
        'elevi.*', 
        'clase.denclasa', 
        'note.nota', 
        'discipline.dendisciplina', 
        'prezente.status'
      )
      .join('clase', 'clase.clasaid', 'elevi.clasaid')
      .join('note', 'note.nrmatricol', 'elevi.nrmatricol')
      .join('discipline', 'discipline.disciplinaid', 'note.disciplinaid')
      .join('prezente', 'prezente.nrmatricol', 'elevi.nrmatricol')
      .groupBy(
        'elevi.nrmatricol', 
        'clase.clasaid', 
        'note.notaid', 
        'discipline.disciplinaid', 
        'prezente.prezentaid'
      );
      logOperation(req.session.userId, 'accesare date elevi');
    
    res.send(rows);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/exams', async (req, res) => {
  knex('exams')
    .select('*')
    .join('clase', 'clase.clasaid', 'exams.clasaid')
    .groupBy('clase.clasaid', 'exams.clasaid', 'exams.exam_id')
    .then(rows => {
      res.send(rows);
    logOperation(req.session.userId, 'accesare examene');

    })

})

// knex
//     .select('*')
//     .from('elevi')
//     .where('nume', '=', 'Marin')
//     .leftJoin('note', 'elevi.nrmatricol', 'note.notaid')
//     .leftJoin('prezente', 'elevi.nrmatricol', 'prezente.prezentaid').then(console.log)


// total number of students
// knex('elevi').count('nrmatricol').then(console.log);

// total number of professors
// knex('profesori').count('profesorid').then(console.log);




app.listen(port);

/*
CHECK NR OF PARENTS
CHECK NR OF STUDENTS
CHECK NR OF PROFESSORS
CHECK STUDENTS FROM A PARTICULAR CLASS
*/

// all parents number
// Promise.all([
//     knex('elevi').whereNotNull('prenumemama').whereNot('prenumemama', '').count('* as countMama'),
//     knex('elevi').whereNotNull('prenumetata').whereNot('prenumetata', '').count('* as countTata')
//   ]).then(([countMama, countTata]) => {
//      const totalParents = Number(countTata[0].countTata) + Number(countMama[0].countMama);
//      console.log(totalParents);
//   }).catch(error => {
//     console.error('Error:', error);
//   });

