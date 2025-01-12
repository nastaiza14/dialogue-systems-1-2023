import { MachineConfig, send, Action, assign } from "xstate";

const sayErrorBack: Action<SDSContext, SDSEvent> = send((context: SDSContext) => ({
  type: "SPEAK",
  value: `Sorry, I don't know what is ${context.recResult[0].utterance}, try again!`,
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
  "10": {
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
            cond: (context) => !!getEntity(context, "query"),
            actions: assign({
              category: (context) => getEntity(context, "query"),
            }),
          },
          {
            target: "meeting",
            cond: (context) => !!getEntity(context, "meeting"),
            actions: assign({
              category: (context) => getEntity(context, "meeting"),
            }),
          },
          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: ".prompt",
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
      },
    },
    // 3 level nested states can't refer to root states, redesign:
    query: {
      initial: "question",
      on: {
        RECOGNISED: [
          {
            target: ".understood",
            cond: (context) => !!getPartialString(context),
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
        TIMEOUT: ".question",
      },
      states: {
        question: {
          entry: say("So, tell me your question"),
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
      },
    },
    meeting: {
      initial: "start_meeting",
      on: {
        RECOGNISED: [
          {
            target: ".when",
            cond: (context) => !!getEntity(context, "title"),
            actions: assign({
              title: (context) => getEntity(context, "title"),
            }),
          },
          {
            target: ".whole_day",
            cond: (context) => !!getEntity(context, "day"),
            actions: assign({
              day: (context) => getEntity(context, "day"),
            }),
          },
          {
            target: ".time",
            cond: (context) => !!getEntity(context, "decline"),
            actions: assign({
              decline: (context) => getEntity(context, "decline"),
            }),
          },
          {
            target: ".finalized",
            cond: (context) => !!getEntity(context, "accept"),
            actions: assign({
              accept: (context) => getEntity(context, "accept"),
            }),
          },
          {
            target: ".confirmation",
            cond: (context) => !!getEntity(context, "time"),
            actions: assign({
              time: (context) => getEntity(context, "time"),
            }),
          },
          {
            target: ".finalized",
            cond: (context) => !!getEntity(context, "accept"),
            actions: assign({
              accept: (context) => getEntity(context, "accept"),
            }),
          },
          {
            target: ".what",
            cond: (context) => !!getEntity(context, "decline"),
            actions: assign({
              decline: (context) => getEntity(context, "decline"),
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
        // To do: assign "title" as "question" when it is undefined (meaning that we come from the meet_person state in query)
        confirmation: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}`,
          })),
          on: { ENDSPEECH: "ask" } 
        },
      
        // Refering to upper state "init" with ^init doesn't work
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