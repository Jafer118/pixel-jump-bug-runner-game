-- ============================================================
-- Pixel Jump: De Bug-Runner — Database schema
-- 4 entiteiten: gebruikers, scores, skins, instellingen
-- ============================================================

CREATE DATABASE IF NOT EXISTS pixel_jump CHARACTER SET utf8mb4;
USE pixel_jump;

-- ---------------------------------------------------------
-- Gebruikers
-- ---------------------------------------------------------
CREATE TABLE gebruikers (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    gebruikersnaam  VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(150) NOT NULL UNIQUE,
    wachtwoord_hash VARCHAR(255) NOT NULL,
    aangemaakt_op   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    laatste_login   DATETIME     NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Skins
-- ---------------------------------------------------------
CREATE TABLE skins (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    naam            VARCHAR(50)  NOT NULL,
    beschrijving    VARCHAR(255) NULL,
    afbeelding_pad  VARCHAR(255) NULL,
    prijs_punten    INT UNSIGNED NOT NULL DEFAULT 0,
    standaard       TINYINT(1)   NOT NULL DEFAULT 0
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Scores
-- ---------------------------------------------------------
CREATE TABLE scores (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    gebruiker_id    INT UNSIGNED NOT NULL,
    skin_id         INT UNSIGNED NULL,
    score           INT UNSIGNED NOT NULL DEFAULT 0,
    behaald_op      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_scores_gebruiker
        FOREIGN KEY (gebruiker_id) REFERENCES gebruikers(id) ON DELETE CASCADE,
    CONSTRAINT fk_scores_skin
        FOREIGN KEY (skin_id) REFERENCES skins(id) ON DELETE SET NULL,
    INDEX idx_scores_gebruiker (gebruiker_id),
    INDEX idx_scores_score (score DESC)
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Gebruiker_skins (koppeltabel: welke skins heeft een gebruiker vrijgespeeld)
-- ---------------------------------------------------------
CREATE TABLE gebruiker_skins (
    gebruiker_id    INT UNSIGNED NOT NULL,
    skin_id         INT UNSIGNED NOT NULL,
    vrijgespeeld_op DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (gebruiker_id, skin_id),
    CONSTRAINT fk_gs_gebruiker FOREIGN KEY (gebruiker_id) REFERENCES gebruikers(id) ON DELETE CASCADE,
    CONSTRAINT fk_gs_skin FOREIGN KEY (skin_id) REFERENCES skins(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Instellingen (per gebruiker: geluid, moeilijkheidsgraad, gekozen skin, ...)
-- ---------------------------------------------------------
CREATE TABLE instellingen (
    gebruiker_id       INT UNSIGNED PRIMARY KEY,
    geluid_aan         TINYINT(1) NOT NULL DEFAULT 1,
    moeilijkheidsgraad ENUM('makkelijk','normaal','moeilijk') NOT NULL DEFAULT 'normaal',
    actieve_skin_id    INT UNSIGNED NULL,
    CONSTRAINT fk_instellingen_gebruiker
        FOREIGN KEY (gebruiker_id) REFERENCES gebruikers(id) ON DELETE CASCADE,
    CONSTRAINT fk_instellingen_skin
        FOREIGN KEY (actieve_skin_id) REFERENCES skins(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------
-- Voorbeeld: standaard skin invoegen
-- ---------------------------------------------------------
INSERT INTO skins (naam, beschrijving, afbeelding_pad, prijs_punten, standaard)
VALUES ('Student (standaard)', 'De originele afstudeer-hoodie look', 'assets/skins/student.png', 0, 1);
