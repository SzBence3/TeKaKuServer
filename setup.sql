-- This file is used to set up the database for the application.

DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS users;



CREATE TABLE IF NOT EXISTS users(
    id INT PRIMARY KEY AUTO_INCREMENT,
    azonosito VARCHAR(50) NOT NULL,
    `name` VARCHAR(50),
    votes INT DEFAULT 0
);
CREATE UNIQUE INDEX idx_azonosito ON users (azonosito);


SHOW TABLES;


CREATE TABLE IF NOT EXISTS tasks(
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_name VARCHAR(50) NOT NULL,
    task_description TEXT,
    task_question TEXT,
    task_type VARCHAR(50) NOT NULL,
    task_hash VARCHAR(64) NOT NULL UNIQUE
);

CREATE UNIQUE INDEX idx_task_hash ON tasks (task_hash);


CREATE TABLE IF NOT EXISTS answers(
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL,
    answer TEXT,
    votes INT DEFAULT 0,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
);
CREATE INDEX idx_task_id ON answers (task_id);

CREATE TABLE IF NOT EXISTS votes(
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    task_id INT NOT NULL,
    answer_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (answer_id) REFERENCES answers(id),
    UNIQUE (user_id, task_id)
);
CREATE INDEX idx_user_id ON votes (user_id);
CREATE INDEX idx_task_id ON votes (task_id);


CREATE TABLE IF NOT EXISTS announcements(
    id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- @block
SHOW TABLES;
-- @block
SELECT * FROM users;
SELECT * FROM tasks;
SELECT * FROM answers;
SELECT * FROM votes;

-- @block
INSERT INTO announcements (title, content) VALUES ('Welcome2', 'The application setup is complete.');
-- @block
SELECT * FROM announcements;