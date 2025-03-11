import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import logo from './Logo.jpg';
import nlp from 'compromise'; // Import the compromise library

const App = () => {
  const [quizStarted, setQuizStarted] = useState(false); // Track if the quiz has started
  const [currentRound, setCurrentRound] = useState('reading');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [transcript, setTranscript] = useState('');
  const [timeLeft, setTimeLeft] = useState(null); // Initialize to null
  const [timerActive, setTimerActive] = useState(false);
  const [score, setScore] = useState(0);
  const [questions, setQuestions] = useState({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [extemporeTimer] = useState(60); // 1-minute timer for Extempore (removed unused setter)
  const [result, setResult] = useState(''); // To display results in the UI
  const [quizCompleted, setQuizCompleted] = useState(false); // Track quiz completion
  const [recognition, setRecognition] = useState(null); // Speech recognition instance
  const [attemptedQuestions, setAttemptedQuestions] = useState({}); // Track attempted questions
  const [sectionScores, setSectionScores] = useState({
    reading: 0,
    listening: 0,
    logical: 0,
    extempore: 0,
  }); // Track scores for each section

  // Define the order of rounds
  const rounds = ['reading', 'listening', 'logical', 'extempore'];

  // Fetch questions from the JSON file
  useEffect(() => {
    fetch('./questions.json')
      .then((response) => response.json())
      .then((data) => setQuestions(data))
      .catch((error) => console.error('Error fetching questions:', error));
  }, []);

  // Get the current question and its time limit
  const currentQuestion = questions[currentRound]?.[currentQuestionIndex];
  const timeLimit = currentQuestion?.time || 0;

  // Grammar check using compromise
  const checkGrammar = useCallback((text) => {
    const doc = nlp(text);

    // Example: Check for tense consistency
    const pastTenseVerbs = doc.verbs().isPastTense().out('array');
    const presentTenseVerbs = doc.verbs().isPresentTense().out('array');
    const tenseError = pastTenseVerbs.length > 0 && presentTenseVerbs.length > 0 ? 1 : 0;

    // Example: Check for pluralization errors
    const nouns = doc.nouns().out('array');
    const pluralNouns = doc.nouns().isPlural().out('array');
    const pluralizationError = nouns.length !== pluralNouns.length ? 1 : 0;

    // Total grammar errors
    const totalErrors = tenseError + pluralizationError;

    // Deduct marks based on errors (5 marks for grammar)
    const grammarScore = Math.max(0, 5 - totalErrors); // Deduct 1 mark per error

    return grammarScore;
  }, []);

  // Evaluate the Extempore round - Memoize with useCallback
  const evaluateExtempore = useCallback((transcript) => {
    if (!currentQuestion) return;
    
    const topic = currentQuestion.topic.toLowerCase();
    const speech = transcript.toLowerCase();

    // Check relevance to the topic (0 to 2 points)
    const relevance = speech.includes(topic) ? 2 : 0; // 2 points for relevance

    // Check fluency (penalize for filler words and pauses)
    const fillerWords = ['um', 'uh', 'like', 'so'];
    const fluencyPenalty = fillerWords.filter((word) => speech.includes(word)).length * 0.5; // Penalty for filler words
    const fluencyScore = Math.max(0, 3 - fluencyPenalty); // 3 points for fluency (max 3, min 0)

    // Check length (minimum 10 words for full marks)
    const length = speech.split(' ').length >= 10 ? 1 : 0; // 1 point for meeting length requirement

    // Grammar check using compromise
    const grammarScore = checkGrammar(transcript); // 5 points for grammar

    // Calculate total score (out of 10 points)
    const contentScore = relevance + fluencyScore + length; // Max 6 points for content, fluency, and length
    const finalScore = Math.min(contentScore + grammarScore, 10); // Cap the score at 10

    setScore((prevScore) => prevScore + finalScore);
    setSectionScores((prev) => ({
      ...prev,
      extempore: prev.extempore + finalScore,
    }));
    setResult(`Speech evaluated! You scored ${finalScore.toFixed(1)} points (Grammar: ${grammarScore}/5, Content/Fluency: ${contentScore}/5).`);
    setAttemptedQuestions((prev) => ({
      ...prev,
      [currentRound]: [...(prev[currentRound] || []), currentQuestionIndex],
    }));

    setTranscript(''); // Reset transcript after evaluation
  }, [currentQuestion, currentRound, currentQuestionIndex, checkGrammar]);

  // Timer logic for rounds - Fixed dependency array
  useEffect(() => {
    let timer;
    if (timerActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prevTime) => prevTime - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setTimerActive(false);
      if (currentRound === 'extempore') {
        if (recognition) recognition.stop(); // Stop speech recognition
        evaluateExtempore(transcript); // Evaluate speech after 1 minute
      } else {
        setResult("Time's up!"); // Display "Time's up!" in the UI
      }
    }
    return () => clearInterval(timer);
  }, [timerActive, timeLeft, currentRound, transcript, recognition, evaluateExtempore]);

  // Start the timer when the question changes
  useEffect(() => {
    if (currentQuestion) {
      setTimeLeft(currentRound === 'extempore' ? extemporeTimer : timeLimit);
      setTimerActive(true);
    }
  }, [currentQuestion, timeLimit, currentRound, extemporeTimer]);

  // Move to the next round when all questions in the current round are completed
  const moveToNextRound = () => {
    const currentRoundIndex = rounds.indexOf(currentRound);
    if (currentRoundIndex < rounds.length - 1) {
      setCurrentRound(rounds[currentRoundIndex + 1]); // Move to the next round
      setCurrentQuestionIndex(0); // Reset question index for the new round
    } else {
      endQuiz(); // End the quiz
    }
  };

  // End the quiz and calculate the final score
  const endQuiz = () => {
    setQuizCompleted(true); // Mark quiz as completed
    calculateFinalScore(); // Calculate and display final score
  };

  // Confirm before ending the quiz
  const confirmEndQuiz = () => {
    if (window.confirm('Are you sure you want to end the quiz?')) {
      endQuiz();
    }
  };

  // Calculate final score and percentage
  const calculateFinalScore = () => {
    // Check if questions is populated
    if (!questions.reading || !questions.listening || !questions.logical || !questions.extempore) {
      setResult("Unable to calculate score - questions not loaded");
      return;
    }
    
    const totalPossibleMarks =
      questions.reading.length * 5 + // Reading: 10 questions × 5 points = 50
      questions.listening.length * 5 + // Listening: 10 questions × 5 points = 50
      questions.logical.length * 5 + // Logical: 10 questions × 5 points = 50
      questions.extempore.length * 10; // Extempore: 2 questions × 10 points = 20

    const percentage = ((score / totalPossibleMarks) * 100).toFixed(2);
    setResult(`You got ${percentage}% correct!`); // Display percentage in the UI
  };

  // Calculate section contributions to the total percentage
  const calculateSectionContributions = () => {
    // Check if questions is populated
    if (!questions.reading || !questions.listening || !questions.logical || !questions.extempore) {
      return { reading: 0, listening: 0, logical: 0, extempore: 0 };
    }
    
    const totalPossibleMarks =
      questions.reading.length * 5 + // Reading: 10 questions × 5 points = 50
      questions.listening.length * 5 + // Listening: 10 questions × 5 points = 50
      questions.logical.length * 5 + // Logical: 10 questions × 5 points = 50
      questions.extempore.length * 10; // Extempore: 2 questions × 10 points = 20

    const sectionContributions = {};
    Object.keys(sectionScores).forEach((section) => {
      const sectionMarks = sectionScores[section];
      const sectionPercentage = ((sectionMarks / totalPossibleMarks) * 100).toFixed(2);
      sectionContributions[section] = sectionPercentage;
    });

    return sectionContributions;
  };

  // Handle next question or move to the next round
  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions[currentRound]?.length - 1) {
      setCurrentQuestionIndex((prevIndex) => prevIndex + 1); // Move to the next question
    } else {
      moveToNextRound(); // Move to the next round
    }
    setUserAnswer('');
    setTranscript('');
    setResult(''); // Clear the result message
  };

  // Text-to-Speech with improved handling
  const speakText = (text) => {
    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1; // Speed of speech (0.1 to 10)
    utterance.pitch = 1; // Pitch of speech (0 to 2)
    utterance.volume = 1; // Volume (0 to 1)

    // Event listeners for better control
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      setIsSpeaking(false);
    };

    // Stop any ongoing speech before starting new one
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  // Speech-to-Text
  const startListening = () => {
    const recognitionInstance = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognitionInstance.lang = 'en-US';
    recognitionInstance.interimResults = true; // Enable interim results
    recognitionInstance.continuous = true; // Continue listening even after pauses
    recognitionInstance.maxAlternatives = 1;

    recognitionInstance.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }
      setTranscript((prev) => prev + finalTranscript); // Append only final results
    };

    recognitionInstance.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
    };

    recognitionInstance.start();
    setRecognition(recognitionInstance); // Store recognition instance
  };

  // Handle answer submission for Reading and Logical rounds
  const handleSubmitAnswer = () => {
    if (!currentQuestion) return;
    
    if (userAnswer.trim().toLowerCase() === currentQuestion.answer.toLowerCase()) {
      const points = 5; // 5 points for correct answer
      setScore((prevScore) => prevScore + points);
      setResult('Correct! You got 5 points.');
      setSectionScores((prev) => ({
        ...prev,
        [currentRound]: prev[currentRound] + points,
      }));
    } else {
      setResult('Incorrect! No points.');
    }
    setAttemptedQuestions((prev) => ({
      ...prev,
      [currentRound]: [...(prev[currentRound] || []), currentQuestionIndex],
    }));
  };

  const renderRoundContent = () => {
    if (!currentQuestion) return null;

    switch (currentRound) {
      case 'reading':
        return (
          <div className="round-section">
            <h3>{currentQuestion.question}</h3>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Your answer"
            />
            <button onClick={handleSubmitAnswer}>Submit</button>
          </div>
        );
      case 'listening':
        return (
          <div className="round-section">
            <h3>Listen to the audio and type what you hear:</h3>
            <button onClick={() => speakText(currentQuestion.text)} disabled={isSpeaking}>
              {isSpeaking ? 'Playing...' : 'Play Audio'}
            </button>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Type what you heard"
            />
            <button onClick={handleSubmitAnswer}>Submit</button>
          </div>
        );
      case 'logical':
        return (
          <div className="round-section">
            <h3>{currentQuestion.question}</h3>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Your answer"
            />
            <button onClick={handleSubmitAnswer}>Submit</button>
          </div>
        );
      case 'extempore':
        return (
          <div className="round-section">
            <h3>Topic: {currentQuestion.topic}</h3>
            <button onClick={startListening}>Start Speaking</button>
            <p>Transcript: {transcript}</p>
            <button onClick={() => evaluateExtempore(transcript)}>Evaluate Speech</button>
          </div>
        );
      default:
        return null;
    }
  };

  // Welcome Screen
  const WelcomeScreen = ({ onStart }) => (
    <div className="welcome-screen">
      <h1>Welcome to the New Guidance Versant Test</h1>
      <p>Please read the instructions below before starting:</p>
      <ul>
        <li>Answer all questions to the best of your ability.</li>
        <li>You will have a limited time for each question.</li>
        <li>Good luck!</li>
      </ul>
      <button onClick={onStart}>Start Quiz</button>
    </div>
  );

  // Progress display (shows attempted questions)
  const ProgressDisplay = () => {
    if (!questions[currentRound]) return null;
    
    return (
      <div className="progress-display">
        <p>Progress: {attemptedQuestions[currentRound]?.length || 0} / {questions[currentRound].length} questions attempted</p>
      </div>
    );
  };

  return (
    <div className="App">
      {!quizStarted ? (
        <WelcomeScreen onStart={() => setQuizStarted(true)} />
      ) : (
        <>
          <div className="header-container"> {/* Container for logo and h1 */}
            <img src={logo} alt="NEW-GUIDANCE Logo" className="logo" />
            <h1>NGTC-VERSANT</h1>
          </div>
          <nav className="quiz-nav">
            <button onClick={() => setCurrentRound('reading')}>Reading</button>
            <button onClick={() => setCurrentRound('listening')}>Listening</button>
            <button onClick={() => setCurrentRound('logical')}>Logical</button>
            <button onClick={() => setCurrentRound('extempore')}>Extempore</button>
          </nav>
          <div className="quiz-content">
            {!quizCompleted && <h2 className="timer">Time Left: {timeLeft !== null ? timeLeft : '--'} seconds</h2>}
            {/* Added ProgressDisplay component to use attemptedQuestions */}
            {!quizCompleted && <ProgressDisplay />}
            {result && <div className="result">{result}</div>} {/* Display result in the UI */}
            {quizCompleted ? (
              <div className="final-result">
                <h2>Quiz Completed!</h2>
                <p className="result-percentage">{result}</p>
                <h3>Section Contributions:</h3>
                <ul className="section-contributions">
                  {Object.entries(calculateSectionContributions()).map(([section, percentage]) => (
                    <li key={section}>
                      {section.charAt(0).toUpperCase() + section.slice(1)}: {percentage}%
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              renderRoundContent()
            )}
            {!quizCompleted && (
              <div className="quiz-controls">
                <button onClick={handleNextQuestion}>Next Question</button>
                <button onClick={confirmEndQuiz} className="end-quiz-button">
                  End Quiz
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default App;