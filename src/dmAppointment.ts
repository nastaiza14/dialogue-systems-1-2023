import { MachineConfig, send, Action, assign } from "xstate";

const sayErrorBack: Action<SDSContext, SDSEvent> = send((context: SDSContext) => ({
  type: "SPEAK",
  value: `Sorry, I don't know what is ${context.recResult[0].utterance}, try again!`,
}));

function say(text: string): Action<SDSContext, SDSEvent> {
  return send((_context: SDSContext) => ({ type: "SPEAK", value: text }));
}

const kbRequest = (text: string) =>
  fetch(
    new Request(
      `https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`
    )
  ).then((data) => data.json());


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
          {
            target: "query",
            cond: (context) => (context.nluResult.prediction.topIntent) === "query",
          },
          { 
            target: "meeting",
            cond: (context) => (context.nluResult.prediction.topIntent) === "create a meeting",
          },
          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Hi, Aya! Tell me, what do you need today?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: sayErrorBack,
          on: { ENDSPEECH: "ask" },
        },
      },
    },
    query: {
      initial: "question",
      on: {
        RECOGNISED: [
          {
            target: ".understood",
            cond: (context) => (context.nluResult.prediction.entities[0].category).includes("name"),
            actions: assign({
              title: (context) => (context.nluResult.prediction.entities[0].text),
            }),
          },
          //{
          //  target: "meeting.when",
          //  cond: (context) => !!getEntity(context, "accept"),
          //  actions: assign({
          //    accept: (context) => getEntity(context, "accept"),
          //  }),
          //},
          //{
          //  target: "init",
          //  cond: (context) => !!getEntity(context, "decline"),
          //  actions: assign({
          //    accept: (context) => getEntity(context, "decline"),
          //  }),
          //},
          {
            target: "meeting.when",
            cond: (context) => (context.nluResult.prediction.entities[0].category) === "accept",
            actions: assign({
              accept: (context) => (context.nluResult.prediction.entities[0].text),
            }),
          },
          {
            target: "init",
            cond: (context) => (context.nluResult.prediction.entities[0].category) === "decline",
            actions: assign({
              decline: (context) => (context.nluResult.prediction.entities[0].text),
            }),
          },
          {
            target: ".no_matches",
          },
        ],
        TIMEOUT: ".question",
      },
      states: {
        question: {
          entry: say("So, tell me your question."),
          on: { ENDSPEECH: "ask" },
        },
        understood: {
          invoke: {
            src: (context, event) => kbRequest(context.title),
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
        // information: {}
      },
    },
    meeting: {
      initial: "start_meeting",
      on: {
        RECOGNISED: [
          {
            target: ".when",
            cond: (context) => (context.nluResult.prediction.entities[0].category) === "meeting",
            actions: assign({
              title: (context) => (context.nluResult.prediction.entities[0].text),
            }),
          },
          {
            target: ".whole_day",
            cond: (context) => (context.nluResult.prediction.entities[0].category) === "day",
            actions: assign({
              day: (context) => (context.nluResult.prediction.entities[0].text),
            }),
          },
          {
            target: ".time",
            cond: (context) => (context.nluResult.prediction.entities[0].category) === "decline",
            actions: assign({
              decline: (context) => (context.nluResult.prediction.entities[0].text),
            }),
          },
          {
            target: ".finalized",
            cond: (context) => (context.nluResult.prediction.entities[0].category) === "accept",
            actions: assign({
              accept: (context) => (context.nluResult.prediction.entities[0].text),
            }),
          },
          {
            target: ".confirmation",
            cond: (context) => (context.nluResult.prediction.entities[0].category) === ("time"),
            actions: assign({
              time: (context) => (context.nluResult.prediction.entities[0].text),
            }),
          },
          {
            target: ".finalized",
            cond: (context) => (context.nluResult.prediction.entities[0].category) === "accept",
            actions: assign({
              accept: (context) => (context.nluResult.prediction.entities[0].text),
            }),
          },
          {
            target: ".what",
            cond: (context) => (context.nluResult.prediction.entities[0].category) === "decline",
            actions: assign({
              decline: (context) => (context.nluResult.prediction.entities[0].text),
            }),
          },
          {
            target: ".nomatch",
          },
        ],
      },
      states: {
        start_meeting: {
          entry: say("Let's create a meeting, then!"),
          on: { ENDSPEECH: "what" },
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
          entry: say("Will it take the whole day?"),
          on: { ENDSPEECH: "ask" } 
        },
        time: {
          entry: say("What time is your meeting?"),
          on: { ENDSPEECH: "ask" } 
        },
        confirmation: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}`,
          })),
          on: { ENDSPEECH: "ask" } 
        },
        finalized: {
          entry: say("Your meeting has been created!"),
          //on: { ENDSPEECH: "init" }
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: sayErrorBack,
          on: { ENDSPEECH: "ask" },
        },
      },
    },
  },
};