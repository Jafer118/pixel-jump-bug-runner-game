# pixel-jump-bug-runner-game
2d runner game
How to get that game running and play it

Quick summary of how to get the whole setup working for your hackathon without making it overly complicated:

What you need to have ready
Make sure XAMPP is running with Apache and MySQL turned on, so your local server is good to go.

The files in your folder
Dump all these files into a single folder inside your htdocs (for example, C:/xampp/htdocs/bug-runner/):

    index.html – The playing field and layout

    style.css – That retro pixel-art style

    script.js – The whole engine for jumping, gravity, and collisions

    speler.png – That blue character with your graduation cap

    bug.png – That annoying red bug with the 404 error

How to test it
Open your browser, type http://localhost/bug-runner/index.html in the address bar (or whatever your folder is called) and the game loads right away. Press the spacebar or click the screen to jump over those red bugs. If you crash, you see your score and you can restart right away via the button.

Setting up that database
For those 4 mandatory entities (Gebruikers, Scores, Skins, Instellingen), you just create your tables in phpMyAdmin. Grab the scores from your JavaScript and shoot them to a small PHP script using a simple fetch so it lands neatly in the database. Easy!
