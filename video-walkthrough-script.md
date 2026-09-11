# Video Walkthrough Script (5 minutes)

Read this in a normal, talking-to-a-friend voice. Do not read it word for word if it feels stiff, just hit the same points in your own words.

---

## 0:00-0:45 — The Problem

**[SCREEN: your face on camera, or a blank slide, no app yet]**

"Hey, so today I want to show you something I built for a sales team.

Here is the problem. After a sales call, someone has to sit down and write a full proposal for the client. That takes time, and it is easy to forget something, or to word things differently every time depending on who wrote it.

And once it is written, sometimes it just gets sent straight to the client with nobody else checking it first. If there is a mistake, the client sees it before anyone catches it."

---

## 0:45-1:30 — The Solution

**[SCREEN: the app's home page or login screen]**

"So I built a tool that fixes this.

A salesperson fills in a simple form with the client's details and what was discussed on the call. Claude, the AI, takes that and writes the first draft of the proposal for them.

But here is the important part: nothing goes to the client automatically. A salesperson can edit it, and then an admin has to actually approve it first. Only after that approval can it be sent out. So there is always a human checking it before the client ever sees it."

---

## 1:30-3:15 — Live Run

**[SCREEN: the intake form, empty]**

"Let me just show you how this actually works.

Here is the form. I'll fill in the client's name, the company, what they need, and roughly what we'd charge and how long it would take."

**[SCREEN: filling in the form fields, then hitting submit/generate]**

"Now I hit generate, and Claude writes each part of the proposal on its own, the introduction, the scope of work, pricing, timeline, all of it."

**[SCREEN: the generated proposal, showing the different sections]**

"Here's what it gave us. If I don't like one part, say the pricing section, I don't have to redo the whole thing. I can just regenerate that one part by itself."

**[SCREEN: clicking regenerate on one section, showing it change while the rest stays the same]**

"See, only that section changed, everything else stayed exactly the same.

Once I'm happy with it, I submit it for approval."

**[SCREEN: submitting, then switching to the admin view / pending approval queue]**

"Now I'm logged in as the admin. I can see it's waiting for approval. I'll review it and approve it."

**[SCREEN: clicking approve]**

"And now that it's approved, I can export it and send it to the client."

**[SCREEN: the exported PDF or the send button, and the final "sent" status]**

"And that's it, the client now has their proposal."

---

## 3:15-4:15 — Important Decisions

**[SCREEN: the audit log page, or the admin dashboard]**

"A couple of decisions I made on purpose here.

First, nothing can be sent to a client before an admin approves it, and this isn't just hidden in the app, it's enforced on the server and in the database itself. So even if someone tried to skip a step by calling the system directly, it still would not be allowed.

Second, I had a limited AI budget, so I built in some cost controls. Regenerating a section is capped, and while I was building and testing the app, I used a mock mode that gives fake sample text instead of actually calling Claude every single time. That saved a lot of the budget for real testing later."

**[SCREEN: pointing at an audit log entry]**

"Every single action, generating, editing, approving, sending, gets logged here. So if something breaks, I can actually see what happened and when."

---

## 4:15-5:00 — Failure + What's Special

**[SCREEN: a proposal with a bad or missing client email, attempting to send]**

"Now let me show you what happens when something goes wrong. Here I typed in a broken email address on purpose.

When I try to send it, watch what happens."

**[SCREEN: the error message showing on screen, e.g. "Client email is missing or malformed"]**

"It does not fail silently. It tells me exactly what's wrong, right here, and it's also written down in the log, so nothing just quietly breaks in the background.

What I think makes this special is that a human is always in the loop before a client sees anything, every action is tracked, and even if the AI or the sending step fails, you always know about it instead of finding out later from an angry client.

That's the project, thanks for watching."

---

### Notes for recording
- Speak slower than feels natural, it always sounds faster on playback.
- If a live Claude generation call is slow, cut to a version you already generated earlier instead of waiting on camera.
- Keep the failure case short and clear, don't over-explain it.
