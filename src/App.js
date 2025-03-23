import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import logo from './Logo.jpg';
import nlp from 'compromise';
import { auth, db, signInWithGoogle, collection, addDoc } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import ResultsPage from './ResultsPage';

const App = () => {
  const [quizStarted, setQuizStarted] = useState(false);
  const [currentRound, setCurrentRound] = useState('reading');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [transcript, setTranscript] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const [timerActive, setTimerActive] = useState(false);
  const [score, setScore] = useState(0);
  const [extemporeRawScores, setExtemporeRawScores] = useState({});
  const [questions, setQuestions] = useState({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [role, setRole] = useState('user'); // Default role
  const [extemporeTimer] = useState(60);
  const [dictionStoryActive, setDictionStoryActive] = useState(false);
  const [currentDictionStory, setCurrentDictionStory] = useState(null);
  const [result, setResult] = useState('');
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [attemptedQuestions, setAttemptedQuestions] = useState({});
  const [sectionScores, setSectionScores] = useState({
    reading: 0,
    listening: 0,
    logical: 0,
    grammar: 0,
    extempore: 0,
    diction: 0,
  });
  const [currentDictionIndex, setCurrentDictionIndex] = useState(0);
  const [user, setUser] = useState(null);

  const rounds = ['reading', 'listening', 'logical', 'grammar', 'extempore', 'diction'];

  // Helper function to normalize answers
  const normalizeAnswer = (answer) => {
    if (typeof answer === 'string') {
      return answer
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=_`~()]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    return ''; // Return an empty string or handle non-string answers appropriately
  };

  // Improved similarity check using compromise
  const checkAnswerSimilarity = (userAnswer, correctAnswer) => {
    const userDoc = nlp(userAnswer);
    const correctDoc = nlp(correctAnswer);

    // Extract nouns, verbs, and objects for comparison
    const userNouns = userDoc.match('#Noun').out('array');
    const correctNouns = correctDoc.match('#Noun').out('array');
    const userVerbs = userDoc.match('#Verb').out('array');
    const correctVerbs = correctDoc.match('#Verb').out('array');

    // Calculate similarity based on shared nouns and verbs
    const sharedNouns = userNouns.filter((noun) => correctNouns.includes(noun)).length;
    const sharedVerbs = userVerbs.filter((verb) => correctVerbs.includes(verb)).length;

    const similarity = (sharedNouns + sharedVerbs) / (correctNouns.length + correctVerbs.length);

    // Log for debugging
    console.log('User Nouns:', userNouns);
    console.log('Correct Nouns:', correctNouns);
    console.log('User Verbs:', userVerbs);
    console.log('Correct Verbs:', correctVerbs);
    console.log('Similarity Score:', similarity);

    return similarity >= 0.7; // Adjust threshold as needed
  };

  // Function to select a random question file
  const selectRandomQuestionFile = useCallback(() => {
    const questionFiles = [
      './questions.json',
      './questions_set2.json',
      './questions_set3.json',
      './questions_set4.json',
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

  const fetchUserRole = async (uid) => {
    const userRef = doc(db, 'users', uid); // Reference to the user's document
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      return userDoc.data().role; // Return the user's role
    } else {
      return 'user'; // Default role
    }
  };

  // Function to create or update a user document in Firestore
  const createUserDocument = async (user) => {
    const userRef = doc(db, 'users', user.uid); // Reference to the user's document
    const userData = {
      uid: user.uid,
      email: user.email,
      role: 'user', // Default role
      createdAt: new Date(),
    };

    try {
      await setDoc(userRef, userData, { merge: true }); // Create or update the document
      console.log('User document created/updated:', user.uid);
    } catch (error) {
      console.error('Error creating/updating user document:', error);
    }
  };

  const speakImportantMessage = (message) => {
  if (!message) return;
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = 'en-US';
  utterance.rate = 1.5;
  utterance.pitch = 1.0;
  
  // Get voices and check if they're loaded
  let voices = window.speechSynthesis.getVoices();
  
  const speakWithVoice = () => {
    // Find a suitable English voice
    const englishVoice = voices.find(voice => voice.lang.includes('en'));
    if (englishVoice) utterance.voice = englishVoice;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      setIsSpeaking(false);
    };
    
    console.log("Speaking message:", message.substring(0, 30) + "...");
    window.speechSynthesis.speak(utterance);
  };
  
  // If voices aren't loaded yet, wait for them
  if (voices.length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      voices = window.speechSynthesis.getVoices();
      speakWithVoice();
    };
  } else {
    speakWithVoice();
  }
};



  useEffect(() => {
    if (!user) {
      const loginMessage = "Welcome to the New Guidance Versant Test. Unfortunately, this test can only be used by registered users. Therefore, please log in and register with your Google account to measure your progress.";
      speakImportantMessage(loginMessage);
    }
  }, [user]);




  // Listen for authentication state changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUser(user); // Set the user state
        await createUserDocument(user); // Create/update user document in Firestore

        // Fetch the user's role
        const role = await fetchUserRole(user.uid);
        setRole(role); // Set the role state
        console.log('User role:', role);
      } else {
        setUser(null); // Reset user state
        setRole('user'); // Reset role state
      }
    });

    return () => unsubscribe(); // Cleanup subscription
  }, []);

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

//Function to handle Grammar round answers

const handleGrammarAnswer = () => {
  if (!currentQuestion) return;

  console.log("Processing grammar answer:", currentQuestion);
  console.log("User answer:", userAnswer);

  const normalizedUserAnswer = normalizeAnswer(userAnswer);
  const normalizedCorrectAnswer = normalizeAnswer(currentQuestion.answer);

  console.log("Normalized user answer:", normalizedUserAnswer);
  console.log("Normalized correct answer:", normalizedCorrectAnswer);

  const isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;

  const questionsInSection = questions.grammar?.length || 5;//Default to 5 if questions are not loaded
  const pointsPerQuestion = 20 / questionsInSection; // Each question contributes equally to the total 20 points

  if (isCorrect) {
    const newSectionScore = sectionScores.grammar + pointsPerQuestion;
    const cappedSectionScore = Math.min(newSectionScore, 20); //ensure the score doesnt exceed 20
    const scoreIncrement = cappedSectionScore - sectionScores.grammar;
    setScore((prevScore) => prevScore + scoreIncrement);
    setResult(`Correct! You got ${pointsPerQuestion.toFixed(1)} points.`);
    setSectionScores((prev) => ({
      ...prev,
      grammar: cappedSectionScore,
    }));    // Provide feedback to the user
    setResult(`Correct! You got ${pointsPerQuestion.toFixed(1)} points.`);
  } else {
    // Provide feedback to the user
    setResult(`Incorrect! The correct sentence is: ${currentQuestion.answer}`);
  }
  setAttemptedQuestions((prev) => ({
    ...prev,
    grammar: [...(prev.grammar || []), currentQuestionIndex],
  }));
};


// Evaluate the Extempore round
const evaluateExtempore = useCallback(
  (transcript) => {
    if (!currentQuestion) return;
    const topic = currentQuestion.topic.toLowerCase();
    const speech = transcript.toLowerCase();
    
    // Existing relevance detection and scoring logic remains the same
    const keywords = topic.split(' ');
    const topicWords = keywords.filter(word => word.length > 3);
    
    const topicRelevance = topicWords.reduce((count, word) => {
      return speech.includes(word) ? count + 1 : count;
    }, 0);
    
    const relevancePercentage = topicWords.length > 0 ? 
      (topicRelevance / topicWords.length) : 0;
    const relevance = Math.min(2, relevancePercentage * 3);
    
    const fillerWords = ['um', 'uh', 'like', 'so', 'you know', 'kind of', 'sort of'];
    
    const fillerWordRegex = new RegExp(`\\b(${fillerWords.join('|')})\\b`, 'gi');
    const fillerMatches = speech.match(fillerWordRegex) || [];
    
    const fillerWordCount = Math.max(0, fillerMatches.length - 3);
    const speechLength = speech.split(' ').length;
    
    const fillerDensity = speechLength > 0 ? 
      (fillerWordCount / speechLength) * 100 : 0;
    
    const fluencyScore = fillerDensity > 8 ? 1 : 
                         fillerDensity > 5 ? 2 : 3;
    
    const length = speechLength >= 30 ? 1 :
                   speechLength >= 15 ? 0.5 : 0;
    
    const grammarScore = checkGrammar(transcript);
    
    // Calculate raw score for this question (out of 10)
    const contentScore = relevance + fluencyScore + length;
    const questionScore = Math.min(contentScore + grammarScore, 10);
    
    // Update scores in state
    const newRawScores = { ...extemporeRawScores };
    newRawScores[currentQuestionIndex] = questionScore;
    setExtemporeRawScores(newRawScores);
    
    // Track attempted questions
    const newAttemptedQuestions = {
      ...attemptedQuestions,
      extempore: [...(attemptedQuestions.extempore || []), currentQuestionIndex],
    };
    setAttemptedQuestions(newAttemptedQuestions);
    
    // FIX: Calculate score proportional to questions and total questions in the round
    const totalQuestionsInRound = questions.extempore?.length || 2;
    const totalRawScore = Object.values(newRawScores).reduce((sum, score) => sum + score, 0);
    const normalizedScore = (totalRawScore / (totalQuestionsInRound * 10)) * 20;
    
    // Update section scores with proper scaling
    setSectionScores((prev) => {
      const oldExtemporeScore = prev.extempore;
      const newExtemporeScore = Math.min(normalizedScore, 20);
      setScore((prevScore) => prevScore - oldExtemporeScore + newExtemporeScore);
      return { ...prev, extempore: newExtemporeScore };
    });
    
    // Feedback message remains the same
    const feedbackMessages = [
      "Great job on your speech!",
      "Well expressed!",
      "Nicely articulated!",
      "Good points made!",
      "Clear delivery!"
    ];
    const randomFeedback = feedbackMessages[Math.floor(Math.random() * feedbackMessages.length)];
    
    setTimeout(() => {
      setResult(
      `${randomFeedback} You scored ${questionScore.toFixed(1)} out of 10 points. 
      (Grammar: ${grammarScore}/5, Topic Relevance: ${relevance.toFixed(1)}/2, 
      Fluency: ${fluencyScore}/3, Content Length: ${length}/1)`
      );
    }, 100);
    
    setTranscript('');
  },
  [currentQuestion, currentQuestionIndex, checkGrammar, extemporeRawScores, attemptedQuestions, questions.extempore]
);






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
        setTimeLeft(30); // Set timer for questions
        setTimerActive(true);
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
        setTimeLeft(currentQuestion.time || 60); // Set timer for story
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
    saveResultsToFirestore();
  };

  // Confirm before ending the quiz
  const confirmEndQuiz = () => {
    if (window.confirm('Are you sure you want to end the quiz?')) {
      endQuiz();
    }
  };

  // Calculate final score and percentage
  const calculateFinalScore = () => {
    if (!questions.reading || !questions.listening || !questions.logical || !questions.grammar || !questions.extempore || !questions.diction) {
      setResult("Unable to calculate score - questions not loaded");
      return;
    }
    const currentScore = score;
    const totalPossibleMarks = 120;
    const percentage = ((currentScore / totalPossibleMarks) * 100).toFixed(2);
    setResult(`You got ${score} out of ${totalPossibleMarks} points (${percentage}%)`);
  };

  // Calculate section contributions to the total percentage
  const calculateSectionContributions = () => {
    if (!questions.reading || !questions.listening || !questions.logical || !questions.grammar || !questions.extempore || !questions.diction) {
      return { reading: 0, listening: 0, logical: 0, grammar: 0, extempore: 0, diction: 0 };
    }
    const totalPossibleMarks = 120;
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

  // Text-to-Speech with slower pace for diction story
  const speakText = (text) => {
    if (!text) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // For diction stories, use the chunking approach
    if (text.length > 200) {
      const chunks = splitTextIntoChunks(text);
      speakTextChunks(chunks);
      return; // Return early - we're handling this with the chunk method
    }

    // For shorter text, use the standard approach
    const utterance = new SpeechSynthesisUtterance(text);

    // Select a more natural voice (will fall back to default if not available)
    let voices = window.speechSynthesis.getVoices();
    const preferredVoices = ['Google US English', 'Microsoft Zira', 'Samantha', 'Alex'];

    // Function to find best available voice
    const findBestVoice = () => {
      // Try to find one of our preferred voices
      for (const preferredVoice of preferredVoices) {
        const foundVoice = voices.find(voice => 
          voice.name.includes(preferredVoice) && voice.lang.includes('en')
        );
        if (foundVoice) return foundVoice;
      }

      // Fall back to any English voice
      const englishVoice = voices.find(voice => voice.lang.includes('en'));
      return englishVoice || null;
    };

    // If voices aren't loaded yet, wait for them
    if (voices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
        utterance.voice = findBestVoice();
        configureUtterance(utterance);
        window.speechSynthesis.speak(utterance);
      };
    } else {
      utterance.voice = findBestVoice();
      configureUtterance(utterance);
      window.speechSynthesis.speak(utterance);
    }
  };

  
  // Configure utterance with appropriate parameters
  const configureUtterance = (utterance) => {
    // Set speech parameters
    utterance.lang = 'en-US';
    
    // Vary rate slightly based on content type
    if (currentRound === 'listening') {
      // Clear enunciation for listening tests
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
    } else if (currentRound === 'diction') {
      // Storytelling style for diction
      utterance.rate = 0.75 + (Math.random() * 0.2); // Slight variation 0.75-0.95
      utterance.pitch = 1.05;
    }
    
    // Add slight natural variations
    utterance.volume = 0.9 + (Math.random() * 0.2); // 0.9-1.1 volume
    
    // Event handlers
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      
      // For diction stories, automatically stop showing story after playback
      if (currentRound === 'diction' && dictionStoryActive) {
        // Add a small delay to make it feel more natural
        setTimeout(() => {
          setDictionStoryActive(false);
          setResult("Story playback complete. Please answer the questions below.");
          setTimeLeft(30); // Set timer for questions
          setTimerActive(true);
        }, 1500);
      }
    };
    
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event.error);
      setIsSpeaking(false);
    };
  };
  

  const splitTextIntoChunks = (text) => {
    // Break at sentence boundaries with reasonable chunk sizes
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks = [];
    let currentChunk = "";
    
    sentences.forEach(sentence => {
      // If adding this sentence would make the chunk too large, start a new chunk
      if (currentChunk.length + sentence.length > 150) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += " " + sentence;
      }
    });
    
    // Add the final chunk if it's not empty
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  };
  // Helper function to speak text chunks with natural pauses
  const speakTextChunks = (chunks, index = 0) => {
    if (!chunks.length || index >= chunks.length) {
      // We've reached the end of the chunks
      setIsSpeaking(false);
      
      // For diction stories, automatically stop showing story after playback
      if (currentRound === 'diction' && dictionStoryActive) {
        setTimeout(() => {
          setDictionStoryActive(false);
          setResult("Story playback complete. Please answer the questions below.");
          setTimeLeft(30); // Set timer for questions
          setTimerActive(true);
        }, 1500);
      }
      return;
    }
    
    setIsSpeaking(true);
    const chunk = chunks[index];
    
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = 'en-US';
    utterance.rate = currentRound === 'diction' ? 0.75 : 0.85; // Slower for diction
    utterance.pitch = 1.0 + (Math.random() * 0.1); // Slight variation
    
    // Select a good voice
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(voice => voice.lang.includes('en'));
    if (englishVoice) utterance.voice = englishVoice;
    
    utterance.onend = () => {
      // Short pause between sentences for natural rhythm
      setTimeout(() => {
        // Move to the next chunk
        speakTextChunks(chunks, index + 1);
      }, 300); // 300ms pause between chunks
    };
    
    utterance.onerror = (event) => {
      console.error('Speech synthesis error in chunk:', event.error);
      // Try to continue with the next chunk despite error
      setTimeout(() => {
        speakTextChunks(chunks, index + 1);
      }, 300);
    };
    
    window.speechSynthesis.speak(utterance);
  };








  // Speech-to-Text
  const startListening = () => {
    // Clear previous transcript when starting new recognition
    setTranscript('');
    
    const recognitionInstance = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognitionInstance.lang = 'en-US';
    recognitionInstance.interimResults = true;
    recognitionInstance.continuous = true;
    recognitionInstance.maxAlternatives = 1;
    
    // Transcript handling with both interim and final results
    let finalTranscript = '';
    
    recognitionInstance.onresult = (event) => {
      let interimTranscriptText = '';
      let newFinalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          newFinalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interimTranscriptText += event.results[i][0].transcript;
        }
      }
      
      // Update with both final and interim results
      if (newFinalTranscript) {
        finalTranscript += newFinalTranscript;
        setTranscript(finalTranscript);
      }
      
      // Show interim results in real-time (optional but useful feedback for user)
      if (interimTranscriptText) {
        // Update UI with the combination of final + interim
        setTranscript(finalTranscript + ' ' + interimTranscriptText);
      }
    };
    
    recognitionInstance.onstart = () => {
      // Visual feedback that recording has started
      setResult("Listening to your speech...");
    };
    
    recognitionInstance.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setResult("There was an error with speech recognition. Please try again.");
    };
    
    recognitionInstance.onend = () => {
      // Don't immediately evaluate when recognition ends
      // This allows user to manually evaluate when they're done
      setResult("Speech recognition completed. Click 'Evaluate Speech' when ready.");
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
  
    // Normalize user's answer
    const normalizedUserAnswer = normalizeAnswer(userAnswer);
    
    // Get the main answer
    const mainAnswer = currentRound === 'listening' ? currentQuestion.text : currentQuestion.answer;
    const normalizedMainAnswer = normalizeAnswer(mainAnswer);
    
    // Get alternative answers if they exist
    const alternativeAnswers = currentQuestion.alternativeAnswers || [];
    const normalizedAltAnswers = alternativeAnswers.map(alt => normalizeAnswer(alt));
  
    // Check if user answer matches any acceptable answer
    let isCorrect = false;
    
    if (currentRound === 'reading' || currentRound === 'diction') {
      // For reading and diction, use similarity checking
      isCorrect = checkAnswerSimilarity(normalizedUserAnswer, normalizedMainAnswer);
      
      // If not similar to main answer, check alternative answers
      if (!isCorrect && alternativeAnswers.length > 0) {
        for (const altAnswer of normalizedAltAnswers) {
          if (checkAnswerSimilarity(normalizedUserAnswer, altAnswer)) {
            isCorrect = true;
            break;
          }
        }
      }
    } else {
      // For other rounds, use exact match
      isCorrect = normalizedUserAnswer === normalizedMainAnswer;
      
      // If no exact match with main answer, check alternative answers
      if (!isCorrect && alternativeAnswers.length > 0) {
        isCorrect = normalizedAltAnswers.includes(normalizedUserAnswer);
      }
    }
  
    if (isCorrect) {
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
        `Incorrect! The correct answer is: ${mainAnswer}`
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
  
    // Get main answer (handle if it's already an array)
    let isCorrect = false;
    
    if (Array.isArray(currentDictionQuestion.answer)) {
      // If answer is already an array, check against each
      isCorrect = currentDictionQuestion.answer.some(ans => 
        normalizedUserAnswer === normalizeAnswer(ans)
      );
    } else {
      // Check main answer
      isCorrect = normalizedUserAnswer === normalizeAnswer(currentDictionQuestion.answer);
      
      // Check alternative answers if they exist
      const alternativeAnswers = currentDictionQuestion.alternativeAnswers || [];
      if (!isCorrect && alternativeAnswers.length > 0) {
        isCorrect = alternativeAnswers.some(alt => 
          normalizedUserAnswer === normalizeAnswer(alt)
        );
      }
    }
  
    if (isCorrect) {
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
      // Display the main answer in the error message
      const correctAnswer = Array.isArray(currentDictionQuestion.answer) 
        ? currentDictionQuestion.answer[0] 
        : currentDictionQuestion.answer;
      setResult(`Incorrect! The correct answer is: ${correctAnswer}`);
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
            <h3>For this reading section, please structure your answers as complete sentences (subject + verb + object).</h3>
            <h3>{currentQuestion.question}</h3>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Type your answer here..."
            />
            <button onClick={handleSubmitAnswer}>Submit Answer</button>
          </div>
        );
      case 'listening':
        return (
          <div className="round-section">
            <h3>Listen carefully and type exactly what you hear:</h3>
            <button onClick={() => speakText(currentQuestion.text)} disabled={isSpeaking}>
              {isSpeaking ? 'Listening...' : 'Play Audio Clip'}
            </button>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="What did you hear? Type it here..."
            />
            <button onClick={handleSubmitAnswer}>Check My Answer</button>
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
              placeholder="Your solution..."
            />
            <button onClick={handleSubmitAnswer}>Submit My Answer</button>
          </div>
        );

        case 'grammar': // New grammar round
        return (
          <div className="round-section">
            <h3>Correct the following sentence:</h3>
            <p>{currentQuestion.question}</p>
            <input
              type="text"
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Type the corrected sentence here..."
            />
            <button onClick={handleGrammarAnswer}>Submit Answer</button>
          </div>
        );
      case 'extempore':
        return (
          <div className="round-section">
            <h3>Topic: {currentQuestion.topic}</h3>
            <p>Take a moment to gather your thoughts, then click the button and speak naturally about this topic.</p>
            <button onClick={startListening}>Start Speaking</button>
            <div className="transcript-container">
              <p>Your speech: {transcript}</p>
            </div>
            <button onClick={() => evaluateExtempore(transcript)}>I'm Done - Evaluate My Speech</button>
          </div>
        );
      case 'diction':
        if (dictionStoryActive) {
          return (
            <div className="round-section">
              <h3>Listen carefully to this short story. You'll answer questions about it afterward.</h3>
              <button onClick={() => speakText(currentQuestion.story)} disabled={isSpeaking}>
                {isSpeaking ? 'Story Playing...' : 'Play the Story'}
              </button>
              <p className="instruction">Feel free to listen as many times as needed before the timer runs out.</p>
            </div>
          );
        } else {
          return (
            <div className="round-section">
              <h3>Question {currentDictionIndex + 1} of {currentQuestion.questions.length}</h3>
              <p>{currentDictionQuestion?.question}</p>
              <input
                type="text"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Write your answer as a complete sentence..."
              />
              <button onClick={handleDictionAnswer}>Submit Answer</button>
            </div>
          );
        }
      default:
        return null;
    }
  };


  // Add this effect at the App component level
useEffect(() => {
  if (user && !quizStarted) {
    // Only speak when user is logged in and quiz hasn't started
    const welcomeMessage = `Welcome to the New Guidance Versant Test. Hi ${user.displayName || user.email}! We're going to assess your English language skills today. This test comprises of six sections: Reading, Listening, Logical, Grammar, Extempore, and Diction. Each section contributes 20 points to your total score of 120. Relax and do your best, for this helps us find the right learning path for you!`;
    speakImportantMessage(welcomeMessage);
  }
}, [user, quizStarted]);
  // Welcome Screen
  const WelcomeScreen = ({ onStart, user }) => {
  
  
    return (
      <div className="welcome-screen">
        <h1>Welcome to the New Guidance Versant Test</h1>
        <p>Hi {user?.displayName || user?.email}! We're going to assess your English language skills today.</p>
        <ul>
          <li>This test comprises of five sections: Reading, Listening, Logical, Grammar, Extempore, & Diction.</li>
          <li>Each section contributes 20 points to your total score of 120.</li>
          <li>Don't worry about the timer - it's just there to keep things interesting.</li>
          <li>Relax and do your best - this helps us find the right learning path for you!</li>
        </ul>
        <button onClick={onStart}>Let's Get Started!</button>
      </div>
    );
  };
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

  // Handle Firebase authentication
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const user = await signInWithGoogle();
    if (user) {
      setUser(user);
      setQuizStarted(false); 
    }
  };

  // Save results to Firestore
  const saveResultsToFirestore = async () => {
    if (!user) return;

    const resultsRef = collection(db, 'results');
    const resultData = {
      userId: user.uid,
      score,
      sectionScores,
      timestamp: new Date(),
    };

    try {
      await addDoc(resultsRef, resultData);
      console.log('Results saved to Firestore');
    } catch (error) {
      console.error('Error saving results to Firestore:', error);
    }
  };

  return (
    <Router basename="/NGTC-Versant-React">
      <div className="App">
        <Routes>
          <Route
            path="/"
            element={
              !user ? (
                <div className="login-screen">
                  <div className="header-container">
                    <img src={logo} alt="NEW-GUIDANCE Logo" className="logo" />
                    <h1>NGTC-VERSANT</h1>
                  </div>
                  <h1>Welcome to the New Guidance Versant Test</h1>
                  <button onClick={handleLogin}>Login with Google</button>
                  <h2>Unfortunately, this test can only be used by registered users. Therefore, please log in and register with your Google account to measure your progress.</h2>
                </div>
              ) : !quizStarted ? (
                <WelcomeScreen onStart={() => setQuizStarted(true)} user={user}  />
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
                        <h2>Time is up {user.displayName || user.email}!</h2>
                        <p className="result-percentage">{result}</p>
                        <h3>Section Scores:</h3>
                        <ul className="section-contributions">
                          {Object.entries(calculateSectionContributions()).map(([section, data]) => (
                            <li key={section}>
                              {section.charAt(0).toUpperCase() + section.slice(1)}: {data.score}/20 ({data.sectionPercentage}%)
                            </li>
                          ))}
                        </ul>
                        <h3>Total Score: {score}/120</h3>
                        <h2>Measure your improvement by checking past results:</h2>
                        <Link to="/results">Fetch All Your Past Results</Link>
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
              )
            }
          />
          <Route path="/results" element={<ResultsPage />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;