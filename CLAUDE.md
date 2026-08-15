do not use co-author when commit.

do not use unnecessary unicode that are hard to maintain with keyborards. (e.g.,
emdash, emojis in document, etc) Including code, commit message, etc.

examples of hard-to-maintain unicode:

- em-dash (use ascii dash instead)
- arrows (use -> instead)
- triple dots (use ascii ... instead)
- emojis
- centered dot U+00B7 (try using ascii , instead)

the above rule applies to all codebase and commites. you are free to use any
character you want in your chat responses.

do not write 'verified in-browser', 'xx/yy tests pass' or similar content in
commit messages. describe only the changes unless it is necessary to provide
context.

keep commites atomic and small. you are completely ok to produce multiple
commits for a single work, unless told otherwise.
