-- This file is used to set up the database for the application.

CREATE TABLE IF NOT EXISTS users(
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    `name` VARCHAR(50),
    votes INT DEFAULT 0
);
CREATE UNIQUE INDEX idx_username ON users (username);


SHOW TABLES;


CREATE TABLE IF NOT EXISTS tasks(
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_name VARCHAR(50) NOT NULL,
    task_description TEXT,
    task_question TEXT,
    task_hash VARCHAR(32) NOT NULL UNIQUE
);

CREATE UNIQUE INDEX idx_task_hash ON tasks (task_hash);
--@BLOCK

--@block
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
    answer_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (answer_id) REFERENCES answers(id),
    UNIQUE (user_id, answer_id)
);
CREATE INDEX idx_user_id ON votes (user_id);
CREATE INDEX idx_answer_id ON votes (answer_id);
-- @endblock
-- @block
SHOW TABLES;

