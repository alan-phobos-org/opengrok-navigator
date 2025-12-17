# Learning

## Approach

* I spent £18 on Claude for a month over Christmas

## What Claude is Doing

* A lot of things it got right first time
* It thinks a lot more as the project and changes get more complicated
* I used all my short term credit in 90 mins
* Where it really got expensive was when I found something it couldn't do in either one or two attempts
* It did some cute stuff where it spotted I wasn't rebuilding the extension after it made some changes when I complained they didn't work and from then on it always ended every change by recompiling the plugin for me
* The usage limits reset every 6-8 hours which encouraged lots of short sessions

## Big Feature

* This feature was showing context around search results... it ended up writing debug logging and asking me to run the code and produce the debug log files...
* Then it really got lost in the details... it couldn't get the log messages to appear in a VSCode debug window until I prompted that it was doing it wrong.
* Things got really funny then. It basically just gave up with the VSCode debug mechanisms and invented it's own output window which it could make visible when it wanted to that I couldn't miss!
* It was at this point that I realised Claude had gone off and started parsing the HTML (using regex!) rather than using the REST API!
* I eventually got it to do context highlighting too, but I was left wondering if there wasn't a better way to do all this using a different widget?
* I later discovered via the CLAUDE.md file that it left the HTML stuff in as a fallback

## The Big Project

* I went with a design stage
* It gave me both human and Claude estimates
* It did some crazy stuff like make icons for the plugin using a python library to render PNGs!
* I asked it to consider doing an MVP vs full thing (said it'd take 20 mins for the full thing or 7 for the MVP, vs 12 hours for a human)
* It even made me a manual test plan to run for it
* Single hardest issue was getting it to lay out the buttons incorrectly. I had to be very specific with what the issue was (because I guess it couldn't 'see' it?)

## Observations

* It was much faster to write the initial simple extension with Claude and it nailed all the boilerplate
* However as things got more complicated it was easier to simply fix the code by hand than walk it through debugging sessions
* It's really not clear when to ask it to go and research something first vs just have a go itself and debug (a bit like in the real world!)
* Big prompts are MUCH much more efficient
* It seems unreasonably good at this