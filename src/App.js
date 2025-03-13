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
  const [currentDictionIndex, setCurrentDictionIndex] = useState(0); // Track current diction question index

  // Define the order of rounds
  const rounds = ['reading', 'listening', 'logical', 'extempore', 'diction'];

  // Helper function to normalize answers
  const normalizeAnswer = (answer) => {
    return answer
      .toLowerCase() // Convert to lowercase
      .replace(/[.,/#!$%^&*;:{}=_`~()]/g, '') // Remove punctuation (no unnecessary escapes)
      .replace(/\s{2,}/g, ' ') // Replace multiple spaces with a single space
      .trim(); // Trim leading and trailing spaces
  };

  // Function to select a random question file
  const selectRandomQuestionFile = useCallback(() => {
    const questionFiles = [
      './questions.json',
      './questions_set2.json',
      './questions_set3.json',
      './questions_set4.json'
    ];
    const randomIndex = Math.floor(Math.random() * questionFiles.length);
    return questionFiles[randomIndex];
  }, []);

  // Fetch questions from a random JSON file
  useEffect(() => {
    const questionFile = selectRandomQuestionFile();
    fetch(questionFile)
      .then((response) => {
        if (!response.ok) return fetch('./questions.json');
        return response;
      })
      .then((response) => response.json())
      .then((data) => setQuestions(data))
      .catch((error) => console.error('Error fetching questions:', error));
  }, [selectRandomQuestionFile]);

  // Get the current question and its time limit
  const currentQuestion = questions[currentRound]?.[currentQuestionIndex];
  const timeLimit = currentQuestion?.time || 0;

  // Grammar check using compromise
  const checkGrammar = useCallback((text) => {
    const doc = nlp(text);
    const pastTenseVerbs = doc.match('#PastTense').out('array');
    const presentTenseVerbs = doc.match('#PresentTense').out('array');
    const tenseError = pastTenseVerbs.length > 0 && presentTenseVerbs.length > 0 ? 1 : 0;
    const nouns = doc.match('#Noun').out('array');
    const pluralNouns = doc.match('#Plural').out('array');
    const pluralizationError = nouns.length !== pluralNouns.length ? 1 : 0;
    const totalErrors = tenseError + pluralizationError;
    const grammarScore = Math.max(0, 5 - totalErrors);
    return grammarScore;
  }, []);

  // Evaluate the Extempore round
  const evaluateExtempore = useCallback((transcript) => {
    if (!currentQuestion) return;
    const topic = currentQuestion.topic.toLowerCase();
    const speech = transcript.toLowerCase();
    const relevance = speech.includes(topic) ? 2 : 0;
    const fillerWords = ['um', 'uh', 'like', 'so'];
    const fluencyPenalty = fillerWords.filter((word) => speech.includes(word)).length * 0.5;
    const fluencyScore = Math.max(0, 3 - fluencyPenalty);
    const length = speech.split(' ').length >= 10 ? 1 : 0;
    const grammarScore = checkGrammar(transcript);
    const contentScore = relevance + fluencyScore + length;
    const questionScore = Math.min(contentScore + grammarScore, 10);
    const newRawScores = { ...extemporeRawScores };
    newRawScores[currentQuestionIndex] = questionScore;
    setExtemporeRawScores(newRawScores);
    const newAttemptedQuestions = {
      ...attemptedQuestions,
      extempore: [...(attemptedQuestions.extempore || []), currentQuestionIndex]
    };
    setAttemptedQuestions(newAttemptedQuestions);
    const totalRawScore = Object.values(newRawScores).reduce((sum, score) => sum + score, 0);
    const totalQuestionsAttempted = Object.keys(newRawScores).length;
    const totalPossibleScore = totalQuestionsAttempted * 10;
    const normalizedScore = (totalRawScore / totalPossibleScore) * 20;
    setSectionScores(prev => {
      const oldExtemporeScore = prev.extempore;
      const newExtemporeScore = Math.min(normalizedScore, 20);
      setScore(prevScore => prevScore - oldExtemporeScore + newExtemporeScore);
      return { ...prev, extempore: newExtemporeScore };
    });
    setResult(`Speech evaluated! You scored ${questionScore.toFixed(1)} out of 10 points (Grammar: ${grammarScore}/5, Content/Fluency: ${contentScore}/5).`);
    setTranscript('');
  }, [currentQuestion, currentQuestionIndex, checkGrammar, extemporeRawScores, attemptedQuestions]);

  // Timer logic for rounds
  useEffect(() => {
    let timer;
    if (timerActive && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prevTime) => prevTime - 1), 1000);
    } else if (timeLeft === 0) {
      setTimerActive(false);
      if (currentRound === 'extempore') {
        if (recognition) recognition.stop();
        evaluateExtempore(transcript);
      } else if (currentRound === 'diction' && dictionStoryActive) {
        setDictionStoryActive(false);
        setResult("Story playback complete. Please answer the questions below.");
      } else {
        setResult("Time's up!");
      }
    }
    return () => clearInterval(timer);
  }, [timerActive, timeLeft, currentRound, transcript, recognition, evaluateExtempore, dictionStoryActive]);

  // Start the timer when the question changes
  useEffect(() => {
    if (currentQuestion) {
      if (currentRound === 'diction' && !dictionStoryActive && currentDictionStory === null) {
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
      setCurrentRound(rounds[currentRoundIndex + 1]);
      setCurrentQuestionIndex(0);
      setCurrentDictionStory(null);
    } else {
      endQuiz();
    }
  };

  // End the quiz and calculate the final score
  const endQuiz = () => {
    setQuizCompleted(true);
    calculateFinalScore();
  };

  // Confirm before ending the quiz
  const confirmEndQuiz = () => {
    if (window.confirm('Are you sure you want to end the quiz?')) {
      endQuiz();
    }
  };

  // Calculate final score and percentage
  const calculateFinalScore = () => {
    if (!questions.reading || !questions.listening || !questions.logical || !questions.extempore || !questions.diction) {
      setResult("Unable to calculate score - questions not loaded");
      return;
    }
    const totalPossibleMarks = 100;
    const percentage = ((score / totalPossibleMarks) * 100).toFixed(2);
    setResult(`You got ${score} out of ${totalPossibleMarks} points (${percentage}%)`);
  };

  // Calculate section contributions to the total percentage
  const calculateSectionContributions = () => {
    if (!questions.reading || !questions.listening || !questions.logical || !questions.extempore || !questions.diction) {
      return { reading: 0, listening: 0, logical: 0, extempore: 0, diction: 0 };
    }
    const totalPossibleMarks = 100;
    const sectionContributions = {};
    Object.keys(sectionScores).forEach((section) => {
      const sectionMarks = sectionScores[section];
      const sectionPercentage = ((sectionMarks / 20) * 100).toFixed(2);
      const overallContribution = ((sectionMarks / totalPossibleMarks) * 100).toFixed(2);
      sectionContributions[section] = {
        score: sectionMarks,
        sectionPercentage,
        overallContribution,
      };
    });
    return sectionContributions;
  };

  // Handle next question or move to the next round
  const handleNextQuestion = () => {
    if (currentRound === 'diction') {
      if (dictionStoryActive) {
        setDictionStoryActive(false);
        setTimerActive(false);
      } else if (currentQuestionIndex < questions[currentRound].length - 1) {
        setCurrentQuestionIndex((prevIndex) => prevIndex + 1);
        setCurrentDictionStory(null);
      } else {
        moveToNextRound();
      }
    } else if (currentQuestionIndex < questions[currentRound]?.length - 1) {
      setCurrentQuestionIndex((prevIndex) => prevIndex + 1);
    } else {
      moveToNextRound();
    }
    setUserAnswer('');
    setTranscript('');
    setResult('');
  };

  // Text-to-Speech with improved handling
  const speakText = (text) => {
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      setIsSpeaking(false);
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  // Speech-to-Text
  const startListening = () => {
    const recognitionInstance = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognitionInstance.lang = 'en-US';
    recognitionInstance.interimResults = true;
    recognitionInstance.continuous = true;
    recognitionInstance.maxAlternatives = 1;
    recognitionInstance.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }
      setTranscript((prev) => prev + finalTranscript);
    };
    recognitionInstance.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
    };
    recognitionInstance.start();
    setRecognition(recognitionInstance);
  };

  // Handle answer submission for Reading, Listening, and Logical rounds
  const handleSubmitAnswer = () => {
    if (!currentQuestion) return;
  
    if (currentRound === 'diction') {
      handleDictionAnswer();
      return;
    }
  
    const questionsInSection = questions[currentRound]?.length || 5;
    const pointsPerQuestion = 20 / questionsInSection;
  
    // Normalize user's answer and correct answer
    const normalizedUserAnswer = normalizeAnswer(userAnswer);
    const normalizedCorrectAnswer = normalizeAnswer(
      currentRound === 'listening' ? currentQuestion.text : currentQuestion.answer
    );
  
    // Compare normalized answers
    if (normalizedUserAnswer === normalizedCorrectAnswer) {
      const newSectionScore = sectionScores[currentRound] + pointsPerQuestion;
      const cappedSectionScore = Math.min(newSectionScore, 20);
      const scoreIncrement = cappedSectionScore - sectionScores[currentRound];
      setScore((prevScore) => prevScore + scoreIncrement);
      setResult(`Correct! You got ${pointsPerQuestion.toFixed(1)} points.`);
      setSectionScores((prev) => ({
        ...prev,
        [currentRound]: cappedSectionScore,
      }));
    } else {
      setResult(
        `Incorrect! The correct answer is: ${
          currentRound === 'listening' ? currentQuestion.text : currentQuestion.answer
        }`
      );
    }
  
    setAttemptedQuestions((prev) => ({
      ...prev,
      [currentRound]: [...(prev[currentRound] || []), currentQuestionIndex],
    }));
  };

  // Handle diction answer submissions
  const handleDictionAnswer = () => {
    if (!currentQuestion || !userAnswer.trim()) return;
  
    const currentDictionQuestion = currentQuestion.questions[currentDictionIndex];
    if (!currentDictionQuestion) return;
  
    const totalDictionQuestions = questions.diction?.reduce(
      (sum, story) => sum + (story.questions?.length || 0),
      0
    ) || 10;
    const pointsPerQuestion = 20 / totalDictionQuestions;
  
    // Normalize user's answer
    const normalizedUserAnswer = normalizeAnswer(userAnswer);
  
    // Check if answer is correct (handle array of possible answers)
    const correctAnswer = Array.isArray(currentDictionQuestion.answer)
      ? currentDictionQuestion.answer.some((ans) => normalizedUserAnswer === normalizeAnswer(ans))
      : normalizedUserAnswer === normalizeAnswer(currentDictionQuestion.answer);
  
    if (correctAnswer) {
      const newSectionScore = sectionScores.diction + pointsPerQuestion;
      const cappedSectionScore = Math.min(newSectionScore, 20);
      const scoreIncrement = cappedSectionScore - sectionScores.diction;
      setScore((prevScore) => prevScore + scoreIncrement);
      setResult(`Correct! You got ${pointsPerQuestion.toFixed(1)} points.`);
      setSectionScores((prev) => ({
        ...prev,
        diction: cappedSectionScore,
      }));
    } else {
      setResult(`Incorrect! The correct answer is: ${currentDictionQuestion.answer}`);
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
  // Get the current diction question
  const currentDictionQuestion = currentRound === 'diction' && currentQuestion?.questions
    ? currentQuestion.questions[currentDictionIndex]
    : null;

  // Render round content
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