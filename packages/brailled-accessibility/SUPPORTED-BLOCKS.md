# Supported blocks

Blocks that editing commands can create and whose values they can change: 122 opcodes. Names are as the editor speaks them, with default values.

## Motion (18)

| Opcode | Spoken name | Kind | Values | On |
| - | - | - | - | - |
| `motion_movesteps` | move 10 steps | instruction | `STEPS` | sprite only |
| `motion_turnright` | turn clockwise 15 degrees | instruction | `DEGREES` | sprite only |
| `motion_turnleft` | turn counterclockwise 15 degrees | instruction | `DEGREES` | sprite only |
| `motion_goto` | go to random position | instruction | `TO` | sprite only |
| `motion_gotoxy` | go to x: 0 y: 0 | instruction | `X` `Y` | sprite only |
| `motion_glideto` | glide 1 sec to random position | instruction | `SECS` `TO` | sprite only |
| `motion_glidesecstoxy` | glide 1 sec to x: 0 y: 0 | instruction | `SECS` `X` `Y` | sprite only |
| `motion_pointindirection` | point in direction 90 | instruction | `DIRECTION` | sprite only |
| `motion_pointtowards` | point towards mouse-pointer | instruction | `TOWARDS` | sprite only |
| `motion_changexby` | change x by 10 | instruction | `DX` | sprite only |
| `motion_setx` | set x to 0 | instruction | `X` | sprite only |
| `motion_changeyby` | change y by 10 | instruction | `DY` | sprite only |
| `motion_sety` | set y to 0 | instruction | `Y` | sprite only |
| `motion_ifonedgebounce` | if on edge, bounce | instruction |  | sprite only |
| `motion_setrotationstyle` | set rotation style left-right | instruction | `STYLE` | sprite only |
| `motion_xposition` | x position | value |  | sprite only |
| `motion_yposition` | y position | value |  | sprite only |
| `motion_direction` | direction | value |  | sprite only |

## Looks (21)

| Opcode | Spoken name | Kind | Values | On |
| - | - | - | - | - |
| `looks_sayforsecs` | say Hello! for 2 seconds | instruction | `MESSAGE` `SECS` | sprite only |
| `looks_say` | say Hello! | instruction | `MESSAGE` | sprite only |
| `looks_thinkforsecs` | think Hmm... for 2 seconds | instruction | `MESSAGE` `SECS` | sprite only |
| `looks_think` | think Hmm... | instruction | `MESSAGE` | sprite only |
| `looks_switchcostumeto` | switch costume to costume1 | instruction | `COSTUME` | sprite only |
| `looks_nextcostume` | next costume | instruction |  | sprite only |
| `looks_changesizeby` | change size by 10 | instruction | `CHANGE` | sprite only |
| `looks_setsizeto` | set size to 100 % | instruction | `SIZE` | sprite only |
| `looks_show` | show | instruction |  | sprite only |
| `looks_hide` | hide | instruction |  | sprite only |
| `looks_gotofrontback` | go to front layer | instruction | `FRONT_BACK` | sprite only |
| `looks_goforwardbackwardlayers` | go forward 1 layers | instruction | `NUM` `FORWARD_BACKWARD` | sprite only |
| `looks_costumenumbername` | costume number | value | `NUMBER_NAME` | sprite only |
| `looks_size` | size | value |  | sprite only |
| `looks_switchbackdropto` | switch backdrop to next backdrop | instruction | `BACKDROP` | both |
| `looks_switchbackdroptoandwait` | switch backdrop to next backdrop and wait | instruction | `BACKDROP` | both |
| `looks_nextbackdrop` | next backdrop | instruction |  | both |
| `looks_changeeffectby` | change color effect by 25 | instruction | `CHANGE` `EFFECT` | both |
| `looks_seteffectto` | set color effect to 0 | instruction | `VALUE` `EFFECT` | both |
| `looks_cleargraphiceffects` | clear graphic effects | instruction |  | both |
| `looks_backdropnumbername` | backdrop number | value | `NUMBER_NAME` | both |

## Sound (9)

| Opcode | Spoken name | Kind | Values | On |
| - | - | - | - | - |
| `sound_playuntildone` | play sound pop until done | instruction | `SOUND_MENU` | both |
| `sound_play` | start sound pop | instruction | `SOUND_MENU` | both |
| `sound_stopallsounds` | stop all sounds | instruction |  | both |
| `sound_changeeffectby` | change pitch effect by 10 | instruction | `VALUE` `EFFECT` | both |
| `sound_seteffectto` | set pitch effect to 100 | instruction | `VALUE` `EFFECT` | both |
| `sound_cleareffects` | clear sound effects | instruction |  | both |
| `sound_changevolumeby` | change volume by -10 | instruction | `VOLUME` | both |
| `sound_setvolumeto` | set volume to 100% | instruction | `VOLUME` | both |
| `sound_volume` | volume | value |  | both |

## Events (9)

| Opcode | Spoken name | Kind | Values | On |
| - | - | - | - | - |
| `event_whenthisspriteclicked` | when this sprite clicked | starts a script |  | sprite only |
| `event_whenflagclicked` | when green flag clicked | starts a script |  | both |
| `event_whenkeypressed` | when space key pressed | starts a script | `KEY_OPTION` | both |
| `event_whenstageclicked` | when stage clicked | starts a script |  | stage only |
| `event_whenbackdropswitchesto` | when backdrop switches to backdrop1 | starts a script | `BACKDROP` | both |
| `event_whengreaterthan` | when loudness > 10 | starts a script | `VALUE` `WHENGREATERTHANMENU` | both |
| `event_whenbroadcastreceived` | when I receive message1 | starts a script | `BROADCAST_OPTION` | both |
| `event_broadcast` | broadcast message1 | instruction | `BROADCAST_INPUT` | both |
| `event_broadcastandwait` | broadcast message1 and wait | instruction | `BROADCAST_INPUT` | both |

## Control (11)

| Opcode | Spoken name | Kind | Values | On |
| - | - | - | - | - |
| `control_start_as_clone` | when I start as a clone | starts a script |  | sprite only |
| `control_delete_this_clone` | delete this clone | ends a script |  | sprite only |
| `control_wait` | wait 1 second | instruction | `DURATION` | both |
| `control_repeat` | repeat 10 | holds blocks | `TIMES` | both |
| `control_forever` | forever | ends a script |  | both |
| `control_if` | if empty then | holds blocks | `CONDITION` | both |
| `control_if_else` | if empty then | holds blocks | `CONDITION` | both |
| `control_wait_until` | wait until empty | instruction | `CONDITION` | both |
| `control_repeat_until` | repeat until empty | holds blocks | `CONDITION` | both |
| `control_stop` | stop all | ends a script | `STOP_OPTION` | both |
| `control_create_clone_of` | create clone of Sprite1 | instruction | `CLONE_OPTION` | both |

## Sensing (19)

| Opcode | Spoken name | Kind | Values | On |
| - | - | - | - | - |
| `sensing_touchingobject` | touching mouse-pointer? | condition | `TOUCHINGOBJECTMENU` | sprite only |
| `sensing_touchingcolor` | touching color purple? | condition | `COLOR` | sprite only |
| `sensing_coloristouchingcolor` | color purple is touching blue? | condition | `COLOR` `COLOR2` | sprite only |
| `sensing_distanceto` | distance to mouse-pointer | value | `DISTANCETOMENU` | sprite only |
| `sensing_setdragmode` | set drag mode draggable | instruction | `DRAG_MODE` | sprite only |
| `sensing_askandwait` | ask What's your name? and wait | instruction | `QUESTION` | both |
| `sensing_answer` | answer | value |  | both |
| `sensing_keypressed` | key space pressed? | condition | `KEY_OPTION` | both |
| `sensing_mousedown` | mouse down? | condition |  | both |
| `sensing_mousex` | mouse x | value |  | both |
| `sensing_mousey` | mouse y | value |  | both |
| `sensing_loudness` | loudness | value |  | both |
| `sensing_timer` | timer | value |  | both |
| `sensing_resettimer` | reset timer | instruction |  | both |
| `sensing_of` | backdrop # of Stage | value | `OBJECT` `PROPERTY` | both |
| `sensing_current` | current year | value | `CURRENTMENU` | both |
| `sensing_dayssince2000` | days since 2000 | value |  | both |
| `sensing_online` | online? | condition |  | both |
| `sensing_username` | username | value |  | both |

## Operators (18)

| Opcode | Spoken name | Kind | Values | On |
| - | - | - | - | - |
| `operator_add` | empty + empty | value | `NUM1` `NUM2` | both |
| `operator_subtract` | empty - empty | value | `NUM1` `NUM2` | both |
| `operator_multiply` | empty \* empty | value | `NUM1` `NUM2` | both |
| `operator_divide` | empty / empty | value | `NUM1` `NUM2` | both |
| `operator_random` | pick random 1 to 10 | value | `FROM` `TO` | both |
| `operator_gt` | empty > 50 | condition | `OPERAND1` `OPERAND2` | both |
| `operator_lt` | empty < 50 | condition | `OPERAND1` `OPERAND2` | both |
| `operator_equals` | empty = 50 | condition | `OPERAND1` `OPERAND2` | both |
| `operator_and` | empty and empty | condition | `OPERAND1` `OPERAND2` | both |
| `operator_or` | empty or empty | condition | `OPERAND1` `OPERAND2` | both |
| `operator_not` | not empty | condition | `OPERAND` | both |
| `operator_join` | join apple banana | value | `STRING1` `STRING2` | both |
| `operator_letter_of` | letter 1 of apple | value | `LETTER` `STRING` | both |
| `operator_length` | length of apple | value | `STRING` | both |
| `operator_contains` | apple contains a? | condition | `STRING1` `STRING2` | both |
| `operator_mod` | empty mod empty | value | `NUM1` `NUM2` | both |
| `operator_round` | round empty | value | `NUM` | both |
| `operator_mathop` | abs of empty | value | `NUM` `OPERATOR` | both |

## Variables and lists (17)

| Opcode | Spoken name | Kind | Values | On |
| - | - | - | - | - |
| `data_variable` | my variable | value | `VARIABLE` | both |
| `data_setvariableto` | set my variable to 0 | instruction | `VALUE` `VARIABLE` | both |
| `data_changevariableby` | change my variable by 1 | instruction | `VALUE` `VARIABLE` | both |
| `data_showvariable` | show variable my variable | instruction | `VARIABLE` | both |
| `data_hidevariable` | hide variable my variable | instruction | `VARIABLE` | both |
| `data_listcontents` | my list | value | `LIST` | both |
| `data_addtolist` | add thing to my list | instruction | `ITEM` `LIST` | both |
| `data_deleteoflist` | delete 1 of my list | instruction | `INDEX` `LIST` | both |
| `data_deletealloflist` | delete all of my list | instruction | `LIST` | both |
| `data_insertatlist` | insert thing at 1 of my list | instruction | `ITEM` `INDEX` `LIST` | both |
| `data_replaceitemoflist` | replace item 1 of my list with thing | instruction | `INDEX` `ITEM` `LIST` | both |
| `data_itemoflist` | item 1 of my list | value | `INDEX` `LIST` | both |
| `data_itemnumoflist` | item # of thing in my list | value | `ITEM` `LIST` | both |
| `data_lengthoflist` | length of my list | value | `LIST` | both |
| `data_listcontainsitem` | my list contains thing? | condition | `ITEM` `LIST` | both |
| `data_showlist` | show list my list | instruction | `LIST` | both |
| `data_hidelist` | hide list my list | instruction | `LIST` | both |

## Not supported

| Blocks | Create | Change values | Move or wrap | Delete |
| - | - | - | - | - |
| Custom block definitions (`procedures_definition`) | no | no | to a new script only | yes, if unused |
| Custom block calls (`procedures_call`) | no | no | yes | yes |
| Custom block parameters (`argument_reporter_*`) | no | no | no | yes |
| Extension blocks (Pen, Music, Video Sensing, Text to Speech, Translate, hardware) while the extension is loaded | no | no | instructions only | yes |
| Hidden older blocks `control_while`, `control_for_each`, `control_all_at_once` | no | no | yes | yes |
| Any other opcode | no | no | no | yes |

Also not supported: deleting variables, lists or messages (except by undoing their creation), cloud variables,
and editing comments.

## Variables, lists and messages

| | Create | Rename | Delete |
| - | - | - | - |
| Variables (for all sprites, or one sprite) | yes | yes | by undo only |
| Lists (for all sprites, or one sprite) | yes | yes | by undo only |
| Broadcast messages | yes; saved once a block uses it | yes | by undo only |
| Cloud variables | no | no | no |

## Loops and conditions that can wrap blocks

`control_repeat`, `control_forever`, `control_repeat_until`, `control_if`, `control_if_else`.
