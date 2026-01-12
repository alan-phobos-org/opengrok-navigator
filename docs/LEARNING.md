# Learning

## Approach

* I spent £18 on Claude for a month over Christmas
* Initially just used Sonnet without 'thinking' but explored that later

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
* I tried funky prompts like 'make the UI look more professional'
* The dark mode feature really seems to be pushing it to the limit

## Observations

* It was much faster to write the initial simple extension with Claude and it nailed all the boilerplate
* However as things got more complicated it was easier to simply fix the code by hand than walk it through debugging sessions
* It's really not clear when to ask it to go and research something first vs just have a go itself and debug (a bit like in the real world!)
* Big prompts are MUCH much more efficient
* It seems unreasonably good at this
* Random observation about how it Googles... I notice it always includes a year in the search term
* The opus model + thinking change was good but it still makes mistakes and it absolutely burns through the limits. I'll try again with just thinking and not opus and vise-versa.
* It taught me about Multipass which looks really cool
* Testing setup scripts: It took a comprehensive design doc and implemented both automated test script and manual test management script with full state management, caching, and multi-instance support. Compacted 1020 lines to 250 lines while keeping all essential info
* The lldb stuff was harder for it. Particularly when doing performance optimisations it just started lying about how much better it had made things. You need to force it to work with real data by adding a timing metric to key commands.

## Testing

* It's great at this if you tell it to go off and do stuff.
* Got it to write a script which sets up a linux VM running opengrok and it failed for a while but about 10 mins of debugging (by itself) later it worked perfectly (see Multipass above)

## Other Weird Stuff

* I tried doing a recipe search and certain websites (bbcgoodfood) blocked Claude from accessing it. But Claude decided it wasn't impressed and did a search to work out how to avoid the issue and found that bbcgoodfoodme (middle east) had the same recipes but no agents control file so it got them from there.
* The integration with Apple Notes is really yanky - it uses some sort of AppleScript hack which can't handle doing fancy formatting like checkboxes etc so it looks like it's properly integrated but it's very limited. I assume apps will get better at this over time.
* Surprisingly good at spotting mistakes in my own actions e.g. when I unpacked files to the wrong directory it scanned the entire filesystem and found them, then pointed out my instructions where wrong.

## Usage Notes

* I got a status bar usage tracker as it got annoying not knowing how my usage is going (weird hackery involving session key cookie copying but it works!)

## Example of Design Decisions

```
### Implementation Challenges

1. **Extracting caller function names**: The OpenGrok API returns the line content where a symbol appears, but doesn't identify the enclosing function. We need to either:
   - Parse the line heuristically (look for function call patterns)
   - Fetch surrounding context to find the function definition
   - Use definition search with path filtering as a heuristic

2. **Callee detection**: Finding what a function calls requires parsing its implementation, which OpenGrok doesn't directly support. Options:
   - Fetch the source file and parse function bodies
   - Limit `--direction callees` to symbols that are also searched

3. **Performance**: Deep traversals can generate many API calls. Mitigations:
   - Parallel fetching at each level
   - Result caching
   - `--max-total` limit on explored nodes
   - Progress indicator showing exploration status
```

## Failure Loop

* Got stuck in one with OpenGrok API. Turned out without observability that the agent was failing to talk to a opengrok.example.com domain it had made up and gave up rather than asking for more help.