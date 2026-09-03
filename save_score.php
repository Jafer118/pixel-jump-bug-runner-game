<?php
/**
 * save_score.php
 * Ontvangt een score (JSON POST) vanuit script.js en slaat deze op
 * in de `scores`-tabel. Werkt samen met db_schema.sql.
 *
 * Verwacht JSON body: { "score": 380, "user_id": 1, "skin_id": 1 }
 * Zonder ingelogde gebruiker wordt de score genegeerd (of pas dit
 * aan naar een "gast"-gebruiker als je anonieme highscores wilt).
 */

header('Content-Type: application/json');

$config = [
    'host' => 'localhost',
    'db'   => 'pixel_jump',
    'user' => 'root',
    'pass' => '',
];

$input = json_decode(file_get_contents('php://input'), true);

$score   = isset($input['score']) ? (int) $input['score'] : null;
$userId  = isset($input['user_id']) ? (int) $input['user_id'] : null;
$skinId  = isset($input['skin_id']) ? (int) $input['skin_id'] : null;

if ($score === null || $userId === null) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'score en user_id zijn verplicht']);
    exit;
}

try {
    $pdo = new PDO(
        "mysql:host={$config['host']};dbname={$config['db']};charset=utf8mb4",
        $config['user'],
        $config['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $stmt = $pdo->prepare(
        'INSERT INTO scores (gebruiker_id, skin_id, score) VALUES (:gebruiker_id, :skin_id, :score)'
    );
    $stmt->execute([
        ':gebruiker_id' => $userId,
        ':skin_id'      => $skinId,
        ':score'        => $score,
    ]);

    echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Databasefout']);
}
