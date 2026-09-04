# pixel-jump-bug-runner-game
2d runner game
User Manual: Pixel Jump: The Bug-Runner

What's in the Folder?
Make sure all these files are put together in your project folder:

    db_schema.sql – The database schema for saving scores and game data.

    index.html – The game layout, canvas, and screens.

    save_score.php – The PHP backend to connect scores to the database.

    script.js – The core game logic for jumping, flying, shooting, gravity, and collision detection.

    style.css – The retro pixel styling and UI design.

2. How to Play & Controls
You can open the game directly by double-clicking index.html in your browser. The controls work as follows:

    Runner Mode: Spacebar or click/tap to jump or shoot.
    Game Over: If your character crashes into a bug or obstacle, the game stops immediately and your score is displayed.

3. Database & XAMPP
Do you want to save scores using save_score.php and db_schema.sql? Just make sure XAMPP is running and your database is properly connected in phpMyAdmin. For regular testing and playing, you don't even need this right away!
