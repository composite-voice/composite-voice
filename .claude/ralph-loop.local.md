---
active: true
iteration: 1
max_iterations: 0
completion_promise: null
started_at: "2026-02-23T11:01:20Z"
---

you\'ll be reviewing and enhancing this project. it is a composite SDK for STT, LLMs and TTS. i work for deepgram so that should be our primary focus. you have API keys  for deepgram, anthropic, and openai in your environment to do testing. we want to ensure the interface between the layers \(STT\/LLM\/TTS\) is flexible around APIs but strict so that anyone can extend the SDK as an open source project. you\'ll be creating examples like \.\/examples\/01-deepgram-anthropic-deepgram using nova-3 STT, aura-2 TTS, and anthropic\'s fastest version of claude 4.6 for the LLM. this is a greenfield project, don\'t be worried about breaking changes. you're expected to make architectural changes if they better the entire SDK. two other requirements, native STT and native TTS, both of which can bypass microphone and speak interfaces and use their own. So if they\'re used as providers, they should disable\/bypass native microphone and speaker audio. continously commit as you're working
