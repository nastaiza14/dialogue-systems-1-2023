import { MachineConfig, send, Action, assign } from "xstate";
import { actions } from "xstate";

const {choose, log} = actions

const sayErrorBack: Action<SDSContext, SDSEvent> = send((context: SDSContext) => ({
  type: "SPEAK",
  value: `Sorry, I can't seem to recognize what is ${context.recResult[0].utterance}, try a different word.`,
}));

function say(text: string): Action<SDSContext, SDSEvent> {
  return send((_context: SDSContext) => ({ type: "SPEAK", value: text }));
}

interface Grammar {
  [index: string]: {
    intent: string;
    entities: {
      [index: string]: string;
    };
  };
}

const grammar: Grammar = {
  "lecture": {
    intent: "meeting",
    entities: { title: "lecture" },
  },
  "lunch": {
    intent: "meeting",
    entities: { title: "lunch" },
  },
  "friday": {
    intent: "friday",
    entities: { day: "friday" },
  },
  "at 10": {
    intent: "time",
    entities: { time: "10" },
  },
  "yes": {
    intent: "answer",
    entities: { accept: "yes" },
  },
  "no": {
    intent: "no",
    entities: { decline: "no" },
  },
  "meeting": {
    intent: "answer",
    entities: { meeting: "meeting" },
  },
  "query": {
    intent: "yes",
    entities: { query: "query" },
  },
  "help": {
    intent: "help",
    entities: { help: "help" },
  },
  "confirmation": {
    intent: "confirmation",
    entities: { conf: "confirmation" },
  },
};

const getEntity = (context: SDSContext, entity: string) => {
  // lowercase the utterance and remove tailing "."
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  if (u in grammar) {
    if (entity in grammar[u].entities) {
      return grammar[u].entities[entity];
    }
  }
  return false;
};


const kbRequest = (text: string) =>
  fetch(
    new Request(
      `https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`
    )
  ).then((data) => data.json());

const getPartialString = (context: SDSContext) => {
  let u = context.recResult[0].utterance.toLowerCase().replace(/\?$/g, "");
  if (u.includes("who is")) {
      return u.replace("who is ", "");
  }
  else if (u.includes("who was")) {
    return u.replace("who was ", "");
  }
  else {
    return false
  }
};



const confirmUtterance = (context: SDSContext) => {
  let u = context.recResult[0].confidence;
  if (u < 0.60) {
    send((context: SDSContext) => ({
      type: "SPEAK",
      value: `Is \"${context.recResult[0].utterance}\" what you are asking?`,
    }))
  }
  else
  {
    return "ok"
  }
}


export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = {
  initial: "idle",
  states: {
    idle: {
      on: {
        CLICK: "init",
      },
    },
    init: {
      on: {
        TTS_READY: "welcome",
        CLICK: "welcome",
      },
    },
    welcome: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          // We are not confirming the detection of the word "help" in this code
          {
            target: "welcome_help",
            cond: (context) => !!getEntity(context, "help"),
            actions: assign({
              help: (context) => getEntity(context, "help"),
            }),
          },
          {
            target: "query",
            cond: (context) => !!getEntity(context, "query") && context.recResult[0].confidence > 0.6,
            actions: assign({
              category: (context) => getEntity(context, "query"),
            }),
          },
          {
            target: ".confirm_query",
            cond: (context) => !!getEntity(context, "query") && context.recResult[0].confidence < 0.6,
            actions: assign({
              category: (context) => getEntity(context, "query"),
            }),
          },
          {
            target: "meeting",
            cond: (context) => !!getEntity(context, "meeting") && context.recResult[0].confidence > 0.6,
            actions: assign({
              category: (context) => getEntity(context, "meeting"),
            }),
          },
          {
            target: ".confirm_meeting",
            cond: (context) => !!getEntity(context, "meeting") && context.recResult[0].confidence < 0.6,
            actions: assign({
              category: (context) => getEntity(context, "meeting"),
            }),
          },
          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: "welcome_timeout",
      },
      states: {
        prompt: {
          entry: say("Hi, Aya, tell me, what do you need today, schedule a meeting or make a query?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: sayErrorBack,
          on: { ENDSPEECH: "ask" },
        },
        hist: {
         type: "history",
         history: "deep"
        },
        confirm_query: {
          initial: "conf_q",
          on: { 
            RECOGNISED : [
              {
                target: "#root.dm.query",
                cond: (context) => !!getEntity(context, "accept"),
                actions: assign({
                  accept: (context) => getEntity(context, "accept")
                })
              },
              {
                target: "prompt",
                cond: (context) => !!getEntity(context, "decline"),
                actions: assign({
                  decline: (context) => getEntity(context, "decline")
                })
              },
            ]
          },
          states:{
            conf_q: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `Is \"${(context.recResult[0].utterance.toLowerCase().replace(/\.$/g, ""))}\" what you meant?`
              })),
              on: { ENDSPEECH: "ask" },
            },
            ask: {entry: send("LISTEN")}
          },
        },
        confirm_meeting: {
          initial: "conf_m",
          on: { 
            RECOGNISED : [
              {
                target: "#root.dm.meeting",
                cond: (context) => !!getEntity(context, "accept"),
                actions: assign({
                  accept: (context) => getEntity(context, "accept")
                })
              },
              {
                target: "prompt",
                cond: (context) => !!getEntity(context, "decline"),
                actions: assign({
                  decline: (context) => getEntity(context, "decline")
                })
              },
            ]
          },
          states:{
            conf_m: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `Is \"${(context.recResult[0].utterance.toLowerCase().replace(/\.$/g, ""))}\" what you meant?`
              })),
              on: { ENDSPEECH: "ask" },
            },
            ask: {entry: send("LISTEN")}
          },

        }
      },
    },
    // 3 level nested states can't refer to root states, redesign:   
    query: {
      initial: "question",
      on: {
        RECOGNISED: [
          {
            target: "query_help",
            cond: (context) => !!getEntity(context, "help"),
            actions: assign({
              help: (context) => getEntity(context, "help"),
            }),
          },
          {
            target: ".understood",
            cond: (context) => !!getPartialString(context) && context.recResult[0].confidence > 0.6,
            actions: assign({
              title: (context) => getPartialString(context),
            }),
          },
          {
            target: ".confirm_request",
            cond: (context) => !!getPartialString(context) && context.recResult[0].confidence < 0.6,
            actions: assign({
              title: (context) => getPartialString(context),
            }),
          },
          {
            target: "meeting.when",
            cond: (context) => !!getEntity(context, "accept"),
            actions: assign({
              accept: (context) => getEntity(context, "accept"),
            }),
          },
          {
            target: "init",
            cond: (context) => !!getEntity(context, "decline"),
            actions: assign({
              accept: (context) => getEntity(context, "decline"),
            }),
          },
          {
            target: ".no_matches",
          },
        ],
        TIMEOUT: "query_timeout",
      },
      states: {
        question: {
          entry: say("Tell me your question"),
          on: { ENDSPEECH: "ask" },
        },
        understood: {
          // Using invoke here
          invoke: {
            src: (context, event) => kbRequest(context.title),
            // Where would the result of kbRequest go if we hadn't used the condition?
            onDone: [{
              target: "speak_request",
              cond: (context, event) => event.data.Abstract !== "",
              actions: assign({
               request: (context, event) => event.data }),
            }],
          },
        },
        speak_request: {
          entry: send((context) => ({
                type: "SPEAK",
                value: `${(context.request.Abstract)}`,
              })),
              on: { ENDSPEECH: "meet_person" }
        },
        meet_person: {
          entry: say("Would you like to meet them?"),
          on: { ENDSPEECH: "ask"}
        },
        ask: {
          entry: send("LISTEN"),
        },
        no_matches: {
          entry: sayErrorBack,
          on: { ENDSPEECH: "ask" },
        },
        hist: {
          type: "history",
          history: "deep"
        },
        confirm_request:{
          initial: "conf_q",
          on: { 
            RECOGNISED : [
              {
                target: "#root.dm.query.understood",
                cond: (context) => !!getEntity(context, "accept"),
                actions: assign({
                  accept: (context) => getEntity(context, "accept")
                })
              },
              {
                target: "#root.dm.query.question",
                cond: (context) => !!getEntity(context, "decline"),
                actions: assign({
                  decline: (context) => getEntity(context, "decline")
                })
              },
            ]
          },
          states:{
            conf_q: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `Is \"${(context.recResult[0].utterance.toLowerCase().replace(/\.$/g, ""))}\" what you meant?`
              })),
              on: { ENDSPEECH: "ask" },
            },
            ask: {entry: send("LISTEN")}
          },
        }
      },
    },
    meeting: {
      initial: "start_meeting",
      on: {
        RECOGNISED: [
          {
            target: "meeting_help",
            cond: (context) => !!getEntity(context, "help"),
            actions: assign({
              help: (context) => getEntity(context, "help"),
            }),
          },
          {
            target: ".when",
            cond: (context) => !!getEntity(context, "title") && context.recResult[0].confidence > 0.6,
            actions: assign({
              title: (context) => getEntity(context, "title"),
            }),
          },
          {
            target: ".confirm_what",
            cond: (context) => !!getEntity(context, "title") && context.recResult[0].confidence < 0.6,
            actions: assign({
              title: (context) => getEntity(context, "title"),
            }),
          },
          {
            target: ".whole_day",
            cond: (context) => !!getEntity(context, "day") && context.recResult[0].confidence > 0.6,
            actions: assign({
              day: (context) => getEntity(context, "day"),
            }),
          },
          {
            target: ".confirm_when",
            cond: (context) => !!getEntity(context, "day") && context.recResult[0].confidence < 0.6,
            actions: assign({
              day: (context) => getEntity(context, "day"),
            }),
          },
          {
            target: ".confirmation",
            cond: (context) => !!getEntity(context, "time") && context.recResult[0].confidence > 0.6,
            actions: assign({
              time: (context) => getEntity(context, "time"),
            }),
          },
          {
            target: ".confirm_time",
            cond: (context) => !!getEntity(context, "time") && context.recResult[0].confidence < 0.6,
            actions: assign({
              time: (context) => getEntity(context, "time"),
            }),
          },
          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: "meeting_timeout",
      },
      states: {
        start_meeting: {
          entry: say("Let's create a meeting, then!"),
          on: { ENDSPEECH: "what" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: sayErrorBack,
          on: { ENDSPEECH: "ask" },
        },
        hist: {
          type: "history",
          history: "deep"
        },
        what: {
          entry: say("What is it about?"),
          on: { ENDSPEECH: "ask" }
        },
        when: {
          entry: say("On what day?"),
          on: { ENDSPEECH: "ask" } 
        },
        whole_day: {
          initial: "conf_wd",
          on: { 
            RECOGNISED : [
            {
              target: "#root.dm.meeting.confirmation",
              cond: (context) => !!getEntity(context, "accept"),
              actions: assign({
                accept: (context) => getEntity(context, "accept")
              }),
            },
            {
              target: "#root.dm.meeting.time",
              cond: (context) => !!getEntity(context, "decline"),
              actions: assign({
                decline: (context) => getEntity(context, "decline"),
              }),
            },
            ],
          },
          states: {
            conf_wd: {
              entry: say("Will it take the whole day?"),
              on: {ENDSPEECH: "ask"}
            },
            ask: {
              entry: send("LISTEN"), 
            }
          }
        },
        time: {
          entry: say("What time is your meeting?"),
          on: { ENDSPEECH: "ask" } 
        },
        // create substates here
        confirmation: {
          initial: "confirm_all",
          on: { 
            RECOGNISED : [
            {
              target: "#root.dm.meeting.finalized",
              cond: (context) => !!getEntity(context, "accept"),
              actions: assign({
                accept: (context) => getEntity(context, "accept")
              }),
            },
            {
              target: "#root.dm.meeting.what",
              cond: (context) => !!getEntity(context, "decline"),
              actions: assign({
                decline: (context) => getEntity(context, "decline"),
              }),
            },
            ],
          },
          states: {
            confirm_all: {
              entry: send((context) => ({
              type: "SPEAK",
              value: `Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}`})),
              on: { ENDSPEECH: "ask" } 
            },
            ask: {
              entry: send("LISTEN"), 
            }
          }
        },
        // Refering to upper state "init" with ^init doesn't work
        finalized: {
          entry: say("Your meeting has been created!"),
          on: { ENDSPEECH: "#root.dm.init" }
        },
        confirm_what: {
          initial: "conf_wha",
          on: { 
            RECOGNISED : [
              {
                target: "#root.dm.meeting.when",
                cond: (context) => !!getEntity(context, "accept"),
                actions: assign({
                  accept: (context) => getEntity(context, "accept")
                })
              },
              {
                target: "#root.dm.meeting.what",
                cond: (context) => !!getEntity(context, "decline"),
                actions: assign({
                  decline: (context) => getEntity(context, "decline")
                })
              },
            ]
          },
          states:{
            conf_wha: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `Is \"${(context.recResult[0].utterance.toLowerCase().replace(/\.$/g, ""))}\" what you meant?`
              })),
              on: { ENDSPEECH: "ask" },
            },
            ask: {entry: send("LISTEN")}
          },
        },
        confirm_when: {
          initial: "conf_whe",
          on: { 
            RECOGNISED : [
              {
                target: "#root.dm.meeting.whole_day",
                cond: (context) => !!getEntity(context, "accept"),
                actions: assign({
                  accept: (context) => getEntity(context, "accept")
                })
              },
              {
                target: "#root.dm.meeting.when",
                cond: (context) => !!getEntity(context, "decline"),
                actions: assign({
                  decline: (context) => getEntity(context, "decline")
                })
              },
            ]
          },
          states:{
            conf_whe: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `Is \"${(context.recResult[0].utterance.toLowerCase().replace(/\.$/g, ""))}\" what you meant?`
              })),
              on: { ENDSPEECH: "ask" },
            },
            ask: {entry: send("LISTEN")}
          },
        },
        confirm_time: {
          initial: "conf_t",
          on: { 
            RECOGNISED : [
              {
                target: "#root.dm.meeting.confirmation",
                cond: (context) => !!getEntity(context, "accept"),
                actions: assign({
                  accept: (context) => getEntity(context, "accept")
                })
              },
              {
                target: "#root.dm.meeting.time",
                cond: (context) => !!getEntity(context, "decline"),
                actions: assign({
                  decline: (context) => getEntity(context, "decline")
                })
              },
            ]
          },
          states:{
            conf_t: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `Is \"${(context.recResult[0].utterance.toLowerCase().replace(/\.$/g, ""))}\" what you meant?`
              })),
              on: { ENDSPEECH: "ask" },
            },
            ask: {entry: send("LISTEN")}
          },
        },
      },
    },
    welcome_help: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `I am here to help you either schedule an appointment or look up information  about any character or personality. Say \"meeting\" for the former or \"query\" for the latter. ${(context.ttsAgenda)}`,
      })),
      on: { ENDSPEECH: "welcome.hist" }
    },
    query_help: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `You have selected query, you may ask: who is or who was someone, after that just answer yes or no if you want to meet them. ${(context.ttsAgenda)}`,
      })),
      on: { ENDSPEECH: "query.hist" }
    },
    meeting_help: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `You have chosen to schedule a meeting, choose a topic, a day, and tell me if its either the whole day or the exact time fo your meeting. ${(context.ttsAgenda)}`,
      })),
      on: { ENDSPEECH: "meeting.hist" }
    },
    welcome_timeout: {
      entry: say("Sorry, I couldn't hear you properly."),
      on: {
        ENDSPEECH: [
          {
            target: "init",
            cond: (context) => (context.count) == 3,
          },
          {
            target: "welcome.hist",
            actions: choose([
              {
                cond: (context) => context.count == null,
                actions: assign({
                  count: (context) => 0
                }),
              },
              {
                cond: (context) => context.count != null,
                actions: assign({ count: (context) => context.count +1 
                }),
              }
            ]),
          },
        ]
      }
    },
    query_timeout: {
      entry: say("Sorry, I couldn't hear you properly."),
      on: {
        ENDSPEECH: [
          {
            target: "init",
            cond: (context) => (context.count) == 3,
          },
          {
            target: "welcome.hist",
            actions: choose([
              {
                cond: (context) => context.count == null,
                actions: assign({
                  count: (context) => 0
                }),
              },
              {
                cond: (context) => context.count != null,
                actions: assign({ count: (context) => context.count +1 
                }),
              }
            ]),
          },
        ]
      }
    },
    meeting_timeout: {
      entry: say("Sorry, I couldn't hear you properly."),
      on: {
        ENDSPEECH: [
          {
            target: "init",
            cond: (context) => (context.count) == 3,
          },
          {
            target: "welcome.hist",
            actions: choose([
              {
                cond: (context) => context.count == null,
                actions: assign({
                  count: (context) => 0
                }),
              },
              {
                cond: (context) => context.count != null,
                actions: assign({ count: (context) => context.count +1 
                }),
              }
            ]),
          },
        ]
      }
    },
    // welcome_utt_confirmation: {
    //   initial: "confirm",
    //   on: { 
    //     RECOGNISED: [
    //     {
    //     target: "welcome.hist",
    //     cond: (context) => !!getEntity(context, "accept"),
    //     actions: assign({
    //       accept: (context) => getEntity(context, "accept") }),
    //     },
    //     {
    //       target: "welcome",
    //       cond: (context) => !!getEntity(context, "decline"),
    //       actions: assign({
    //         decline: (context) => getEntity(context, "decline") }),
    //       },
    //     ]
    //   },
    //   states: {
    //     confirm : {
    //       entry: send((context) => ({
    //         type: "SPEAK",
    //         value: `Is \"${(context.recResult[0].utterance.toLowerCase().replace(/\.$/g, ""))}\" what you meant?`
    //       })),
    //       on: { ENDSPEECH : "ask" }
    //     },
    //     ask: {
    //       entry: send("LISTEN"),
    //     },
    //   }
    // }
  }
};