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
  const [extemporeRawScores, setExtemporeRawScores] = useState({});
  const [questions, setQuestions] = useState({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [extemporeTimer] = useState(60); // 1-minute timer for Extempore (removed unused setter)
  const [dictionStoryActive, setDictionStoryActive] = useState(false); // Track if story is being played
  const [currentDictionStory, setCurrentDictionStory] = useState(null); // Current story being played
  const [result, setResult] = useState(''); // To display results in the UI
  const [quizCompleted, setQuizCompleted] = useState(false); // Track quiz completion
  const [recognition, setRecognition] = useState(null); // Speech recognition instance
  const [attemptedQuestions, setAttemptedQuestions] = useState({}); // Track attempted questions
  const [sectionScores, setSectionScores] = useState({
    reading: 0,
    listening: 0,
    logical: 0,
    extempore: 0,
    diction: 0,
  }); // Track scores for each section

  // Define the order of rounds
  const rounds = ['reading', 'listening', 'logical', 'extempore', 'diction'];

  // Function to select a random question file
  const selectRandomQuestionFile = useCallback(() => {
    // Define the available question files (you'll need to create these)
    const questionFiles = [
      './questions.json',
      './questions_set2.json',
      './questions_set3.json',
      './questions_set4.json'
    ];
    
    // Select a random file from the list
    const randomIndex = Math.floor(Math.random() * questionFiles.length);
    return questionFiles[randomIndex];
  }, []);

  // Fetch questions from a random JSON file
  useEffect(() => {
    const questionFile = selectRandomQuestionFile(); // Select a random file
    
    fetch(questionFile)
      .then((response) => {
        if (!response.ok) {
          // If the random file doesn't exist, fall back to questions.json
          return fetch('./questions.json');
        }
        return response;
      })
      .then((response) => response.json())
      .then((data) => {
        setQuestions(data);
      })
      .catch((error) => console.error('Error fetching questions:', error));
  }, [selectRandomQuestionFile]); // Add selectRandomQuestionFile to the dependency array

  // Get the current question and its time limit
  const currentQuestion = questions[currentRound]?.[currentQuestionIndex];
  const timeLimit = currentQuestion?.time || 0;

  // Grammar check using compromise
  const checkGrammar = useCallback((text) => {
    const doc = nlp(text);

    // Check for tense consistency
    const pastTenseVerbs = doc.match('#PastTense').out('array'); // Match past tense verbs
    const presentTenseVerbs = doc.match('#PresentTense').out('array'); // Match present tense verbs
    const tenseError = pastTenseVerbs.length > 0 && presentTenseVerbs.length > 0 ? 1 : 0;

    // Check for pluralization errors
    const nouns = doc.match('#Noun').out('array'); // Match all nouns
    const pluralNouns = doc.match('#Plural').out('array'); // Match plural nouns
    const pluralizationError = nouns.length !== pluralNouns.length ? 1 : 0;

    // Total grammar errors
    const totalErrors = tenseError + pluralizationError;

    // Deduct marks based on errors (5 marks for grammar)
    const grammarScore = Math.max(0, 5 - totalErrors); // Deduct 1 mark per error

    return grammarScore;
  }, []);
  
// Evaluate the Extempore round
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
  const grammarScore = checkGrammar(transcript); // Up to 5 points for grammar

  // Calculate score for this question (out of 10 points)
  const contentScore = relevance + fluencyScore + length; // Max 6 points for content, fluency, and length
  const questionScore = Math.min(contentScore + grammarScore, 10); // Cap the score at 10

  // Store the raw score for this question
  const newRawScores = { ...extemporeRawScores };
  newRawScores[currentQuestionIndex] = questionScore;
  setExtemporeRawScores(newRawScores);

  // Update the attempted questions
  const newAttemptedQuestions = {
    ...attemptedQuestions,
    extempore: [...(attemptedQuestions.extempore || []), currentQuestionIndex]
  };
  setAttemptedQuestions(newAttemptedQuestions);

  // Calculate the total raw score
  const totalRawScore = Object.values(newRawScores).reduce((sum, score) => sum + score, 0);
  
  // Calculate how many questions have been attempted
  const totalQuestionsAttempted = Object.keys(newRawScores).length;
  
  // Calculate the total possible score for completed questions
  const totalPossibleScore = totalQuestionsAttempted * 10;
  
  // Calculate the normalized score (out of 20)
  const normalizedScore = (totalRawScore / totalPossibleScore) * 20;

  // Update the section score
  setSectionScores(prev => {
    const oldExtemporeScore = prev.extempore;
    const newExtemporeScore = Math.min(normalizedScore, 20); // Cap at 20
    
    // Update the total score
    setScore(prevScore => prevScore - oldExtemporeScore + newExtemporeScore);
    
    return {
      ...prev,
      extempore: newExtemporeScore
    };
  });

  setResult(`Speech evaluated! You scored ${questionScore.toFixed(1)} out of 10 points (Grammar: ${grammarScore}/5, Content/Fluency: ${contentScore}/5).`);
  setTranscript(''); // Reset transcript after evaluation
}, [currentQuestion, currentQuestionIndex, checkGrammar, extemporeRawScores, attemptedQuestions]);// Timer logic for rounds
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
      } else if (currentRound === 'diction' && dictionStoryActive) {
        // When the story time ends, show the questions
        setDictionStoryActive(false);
        setResult("Story playback complete. Please answer the questions below.");
      } else {
        setResult("Time's up!"); // Display "Time's up!" in the UI
      }
    }
    return () => clearInterval(timer);
  }, [timerActive, timeLeft, currentRound, transcript, recognition, evaluateExtempore, dictionStoryActive]);

  // Start the timer when the question changes
  useEffect(() => {
    if (currentQuestion) {
      if (currentRound === 'diction' && !dictionStoryActive && currentDictionStory === null) {
        // Initialize diction story
        setCurrentDictionStory(currentQuestion);
        setDictionStoryActive(true);
        setTimeLeft(currentQuestion.time || 45);
        setTimerActive(true);
      } else if (currentRound !== 'diction') {
        setTimeLeft(currentRound === 'extempore' ? extemporeTimer : timeLimit);
        setTimerActive(true);
      }
    }
  }, [currentQuestion, timeLimit, currentRound, extemporeTimer, dictionStoryActive, currentDictionStory]);

  // Move to the next round when all questions in the current round are completed
  const moveToNextRound = () => {
    const currentRoundIndex = rounds.indexOf(currentRound);
    if (currentRoundIndex < rounds.length - 1) {
      setCurrentRound(rounds[currentRoundIndex + 1]); // Move to the next round
      setCurrentQuestionIndex(0); // Reset question index for the new round
      setCurrentDictionStory(null); // Reset diction story
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
    if (!questions.reading || !questions.listening || !questions.logical || !questions.extempore || !questions.diction) {
      setResult("Unable to calculate score - questions not loaded");
      return;
    }

    // Calculate total possible marks - each section worth 20 points
    const totalPossibleMarks = 100; // 5 sections × 20 points each = 100

    const percentage = ((score / totalPossibleMarks) * 100).toFixed(2);
    setResult(`You got ${score} out of ${totalPossibleMarks} points (${percentage}%)`);
  };

  // Calculate section contributions to the total percentage
  const calculateSectionContributions = () => {
    // Check if questions is populated
    if (!questions.reading || !questions.listening || !questions.logical || !questions.extempore || !questions.diction) {
      return { reading: 0, listening: 0, logical: 0, extempore: 0, diction: 0 };
    }

    // Each section contributes 20 points to a total of 100
    const totalPossibleMarks = 100;

    const sectionContributions = {};
    Object.keys(sectionScores).forEach((section) => {
      const sectionMarks = sectionScores[section];
      const sectionPercentage = ((sectionMarks / 20) * 100).toFixed(2); // Each section worth 20 points
      const overallContribution = ((sectionMarks / totalPossibleMarks) * 100).toFixed(2);
      sectionContributions[section] = {
        score: sectionMarks,
        sectionPercentage, // Percentage of available points in this section
        overallContribution, // Contribution to overall score (out of 100)
      };
    });

    return sectionContributions;
  };

  // Handle next question or move to the next round
  const handleNextQuestion = () => {
    if (currentRound === 'diction') {
      // For diction, we need to handle the story and its questions
      if (dictionStoryActive) {
        // If story is active, skip to questions
        setDictionStoryActive(false);
        setTimerActive(false);
      } else if (currentQuestionIndex < questions[currentRound].length - 1) {
        // Move to next story
        setCurrentQuestionIndex((prevIndex) => prevIndex + 1);
        setCurrentDictionStory(null); // Reset current story to trigger new one
      } else {
        moveToNextRound();
      }
    } else if (currentQuestionIndex < questions[currentRound]?.length - 1) {
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

  // Handle answer submission for Reading, Listening, and Logical rounds
  // Handle answer submission for Reading, Listening, and Logical rounds
// Handle answer submission for Reading, Listening, and Logical rounds
const handleSubmitAnswer = () => {
  if (!currentQuestion) return;

  // For diction section
  if (currentRound === 'diction') {
    handleDictionAnswer();
    return;
  }

  // Calculate points per question for this section
  const questionsInSection = questions[currentRound]?.length || 5;
  const pointsPerQuestion = 20 / questionsInSection; // Normalize to 20 points total

  // Special handling for listening round
  if (currentRound === 'listening') {
    // Compare with the text property (since that's what's being spoken)
    if (userAnswer.trim().toLowerCase() === currentQuestion.text.toLowerCase()) {
      // Calculate the new section score
      const newSectionScore = sectionScores[currentRound] + pointsPerQuestion;
      // Cap the section score at 20
      const cappedSectionScore = Math.min(newSectionScore, 20);
      // Calculate the increment to add to the total score
      const scoreIncrement = cappedSectionScore - sectionScores[currentRound];
      
      setScore(prevScore => prevScore + scoreIncrement);
      setResult(`Correct! You got ${pointsPerQuestion.toFixed(1)} points.`);
      
      setSectionScores(prev => ({
        ...prev,
        [currentRound]: cappedSectionScore,
      }));
    } else {
      setResult('Incorrect! No points.');
    }
  } else {
    // For reading and logical rounds
    if (userAnswer.trim().toLowerCase() === currentQuestion.answer.toLowerCase()) {
      // Calculate the new section score
      const newSectionScore = sectionScores[currentRound] + pointsPerQuestion;
      // Cap the section score at 20
      const cappedSectionScore = Math.min(newSectionScore, 20);
      // Calculate the increment to add to the total score
      const scoreIncrement = cappedSectionScore - sectionScores[currentRound];
      
      setScore(prevScore => prevScore + scoreIncrement);
      setResult(`Correct! You got ${pointsPerQuestion.toFixed(1)} points.`);
      
      setSectionScores(prev => ({
        ...prev,
        [currentRound]: cappedSectionScore,
      }));
    } else {
      setResult('Incorrect! No points.');
    }
  }

  setAttemptedQuestions(prev => ({
    ...prev,
    [currentRound]: [...(prev[currentRound] || []), currentQuestionIndex],
  }));
};
// Handle diction answer submissions
const handleDictionAnswer = () => {
  if (!currentQuestion || !userAnswer.trim()) return;

  const currentDictionQuestion = currentQuestion.questions[currentDictionIndex];
  if (!currentDictionQuestion) return;

  // Calculate total questions in the diction section
  const totalDictionQuestions = questions.diction?.reduce(
    (sum, story) => sum + (story.questions?.length || 0), 
    0
  ) || 10;
  
  // Calculate points per question to normalize to 20 points total
  const pointsPerQuestion = 20 / totalDictionQuestions;

  // Check if answer is correct (handle array of possible answers)
  const correctAnswer = Array.isArray(currentDictionQuestion.answer)
    ? currentDictionQuestion.answer.some(ans => userAnswer.trim().toLowerCase() === ans.toLowerCase())
    : userAnswer.trim().toLowerCase() === currentDictionQuestion.answer.toLowerCase();

  if (correctAnswer) {
    // Calculate the new section score
    const newSectionScore = sectionScores.diction + pointsPerQuestion;
    // Cap the section score at 20
    const cappedSectionScore = Math.min(newSectionScore, 20);
    // Calculate the increment to add to the total score
    const scoreIncrement = cappedSectionScore - sectionScores.diction;
    
    setScore(prevScore => prevScore + scoreIncrement);
    setResult(`Correct! You got ${pointsPerQuestion.toFixed(1)} points.`);
    
    setSectionScores(prev => ({
      ...prev,
      diction: cappedSectionScore,
    }));
  } else {
    setResult('Incorrect! No points.');
  }

  // Move to next diction question or reset
  if (currentDictionIndex < currentQuestion.questions.length - 1) {
    setCurrentDictionIndex(currentDictionIndex + 1);
  } else {
    setCurrentDictionIndex(0);
    handleNextQuestion(); // Move to next story or section
  }

  setUserAnswer('');
};

  // Track the current diction question index
  const [currentDictionIndex, setCurrentDictionIndex] = useState(0);

  // Get the current diction question
  const currentDictionQuestion = currentRound === 'diction' && currentQuestion?.questions
    ? currentQuestion.questions[currentDictionIndex]
    : null;

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
            <h3>Listen to the audio and type what you hear including commas and fullstops:</h3>
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
      case 'diction':
        if (dictionStoryActive) {
          return (
            <div className="round-section">
              <h3>Listen to the story and answer in sub + verb + noun format, eg. Tom went to the market.</h3>
              <button onClick={() => speakText(currentQuestion.story)} disabled={isSpeaking}>
                {isSpeaking ? 'Playing...' : 'Play Story'}
              </button>
              <p className="instruction">Questions will appear after the story ends.</p>
            </div>
          );
        } else {
          return (
            <div className="round-section">
              <h3>Question {currentDictionIndex + 1}/{currentQuestion.questions.length}</h3>
              <p>{currentDictionQuestion?.question}</p>
              <input
                type="text"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Your answer"
              />
              <button onClick={handleDictionAnswer}>Submit</button>
            </div>
          );
        }
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
        <li>This test consists of 5 sections: Reading, Listening, Logical, Extempore, and Diction.</li>
        <li>Each section is worth 20 points, for a total of 100 points.</li>
        <li>You will have a limited time for each question.</li>
        <li>Answer all questions to the best of your ability.</li>
        <li>Good luck!</li>
      </ul>
      <button onClick={onStart}>Start Quiz</button>
    </div>
  );

  // Progress display (shows attempted questions)
  const ProgressDisplay = () => {
    if (!questions[currentRound]) return null;

    // For diction, show different progress info
    if (currentRound === 'diction' && !dictionStoryActive && currentQuestion) {
      return (
        <div className="progress-display">
          <p>Story: {currentQuestionIndex + 1}/{questions[currentRound].length}</p>
          <p>Question: {currentDictionIndex + 1}/{currentQuestion.questions.length}</p>
        </div>
      );
    }

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
          <div className="header-container">
            <img src={logo} alt="NEW-GUIDANCE Logo" className="logo" />
            <h1>NGTC-VERSANT</h1>
          </div>
          <nav className="quiz-nav">
            {rounds.map((round) => (
              <button
                key={round}
                onClick={() => setCurrentRound(round)}
                className={currentRound === round ? 'active' : ''}
              >
                {round.charAt(0).toUpperCase() + round.slice(1)}
              </button>
            ))}
          </nav>
          <div className="quiz-content">
            {!quizCompleted && <h2 className="timer">Time Left: {timeLeft !== null ? timeLeft : '--'} seconds</h2>}
            {!quizCompleted && <ProgressDisplay />}
            {result && <div className="result">{result}</div>}
            {quizCompleted ? (
              <div className="final-result">
                <h2>Quiz Completed!</h2>
                <p className="result-percentage">{result}</p>
                <h3>Section Scores:</h3>
                <ul className="section-contributions">
                  {Object.entries(calculateSectionContributions()).map(([section, data]) => (
                    <li key={section}>
                      {section.charAt(0).toUpperCase() + section.slice(1)}: {data.score}/20 ({data.sectionPercentage}%)
                    </li>
                  ))}
                </ul>
                <h3>Total Score: {score}/100</h3>
              </div>
            ) : (
              renderRoundContent()
            )}
            {!quizCompleted && (
              <div className="quiz-controls">
                <button onClick={handleNextQuestion}>
                  {currentRound === 'diction' && dictionStoryActive ? 'Skip Story' : 'Next Question'}
                </button>
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