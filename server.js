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


app.get('/', (req, res) => {
  res.json({
    "userId": req.session.userId,
    "userSessionId": req.session.id
  });
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
  const { firstName, lastName, cnp, email, password, address } = req.body;
  const randomMatricol = Math.floor(Math.random() * 100);
  console.log(firstName, lastName, cnp, email, password, address);
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
              nrmatricol: `MAT${randomMatricol}`,
              nume: lastName,
              prenume: firstName,
              datanasterii: new Date(),
              cnp: cnp,
              adresa: address,
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
app.get('/check-session', async (req, res) => {

})

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
  knex('elevi')
  .select('*')  // Selects all columns; modify to specify columns if needed to avoid ambiguity or to improve performance
  .join('clase', 'clase.clasaid', 'elevi.clasaid')  // Joins the 'clase' table
  .join('note', 'note.nrmatricol', 'elevi.nrmatricol')  // Joins the 'note' table
  .join('prezente', 'prezente.nrmatricol', 'elevi.nrmatricol')  // Joins the 'prezente' table
  .groupBy('prezente.prezentaid', 'prezente.nrmatricol', 'elevi.nrmatricol', 'note.notaid', 'clase.clasaid')  // Group by these columns
  .then(rows => {
    res.send(rows);
  })
  .catch(error => {
    console.error(error);
  });
})

app.get('/exams', async (req, res) => {
  knex('exams')
    .select('*')
    .join('clase', 'clase.clasaid', 'exams.clasaid')
    .groupBy('clase.clasaid', 'exams.clasaid', 'exams.exam_id')
    .then(rows => {
      res.send(rows);
      console.log(rows);
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

