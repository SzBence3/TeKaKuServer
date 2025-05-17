
const mysql = require('mysql2');

const pool = mysql.createPool(require('./mysql.json'));

pool.on('error', (err) => {
  console.error('MySQL error:', err);
});

class Task {
  constructor(name, description, question, solution) {
    this.name = name;
    this.question = question;
    this.description = description;
    this.solution = solution;
  }
}

// this function handles the incoming get requests

async function getSolution(task){
  
  return new Promise((resolve, reject) => {
    pool.query('SELECT id FROM tasks WHERE task_hash = ?', sha256(task.name+";"+task.question), (err, results) => {
      if (err) {
        console.error('Error executing query:', err);
        reject(err);
      } else {
        if (results.length > 0) {
          pool.query('SELECT answer,votes FROM answers WHERE task_id = ? ORDER BY votes DESC', results[0].id, (err, results) => {
            if (err) {
              console.error('Error executing query:', err);
              reject(err);
            } else {
              if (results.length > 0) {
                let totalVotes = 0;
                for (let i = 0; i < results.length; i++) {
                  totalVotes += results[i].votes;
                }
                resolve({
                  answer: results[0].answer,
                  votes: results[0].votes,
                  totalVotes: totalVotes,
                })
              } else {
                resolve(null);
              }
            }
          })
        } else {
          resolve(null);
        }
      }
    });
  });
}

