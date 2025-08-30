# TeKaKu
=========

Ez egy nodejs server. A root mappában van az index.js amit kell futtatni.
A program a 3000-res portot használja.
Szükséges még egy mysql szerver amin le kell futtatni a setup.sql fájlt.

# Szükséges fájlok

*mysql.json*:
{
    "user":?,
    "database":?,
    "password":?,
    "host":?,
    "port":?,
    "waitForConnections": true,
    "connectionLimit": 10,
    "maxIdle": 10, 
    "idleTimeout": 60000, 
    "queueLimit": 0,
    "enableKeepAlive": true,
    "keepAliveInitialDelay": 0
}

*password.json*:
{
    "password": ?
}
ez a jelszó az announcementek hozzáadására.


# Használat

A szerver elindításához le kell futtatni a start.sh/bat fájlokat.
A szerver megálítása a stop.sh/bat fájlokkal történik.
Ne felejtsd neki megadni az execute jogot.


