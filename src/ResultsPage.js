import React, { useEffect, useState } from "react";
import { auth, fetchResults } from "./firebase";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from "chart.js";
import logo from "./Logo.jpg";
import "./ResultsPage.css";

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const ResultsPage = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [resultsPerPage] = useState(5);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user);
        if (user.email === "admin@example.com") {
          setIsAdmin(true);
        }
      } else {
        setUser(null);
        setIsAdmin(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchUserResults = async () => {
      try {
        if (!user) {
          setLoading(false);
          return;
        }

        const userResults = await fetchResults(user.uid);

        if (isAdmin) {
          const allResults = await fetchResults();
          setResults(allResults);
        } else {
          setResults(userResults);
        }

        setLoading(false);
      } catch (error) {
        console.error("Error fetching results:", error);
        setLoading(false);
      }
    };

    fetchUserResults();
  }, [user, isAdmin]);

  // Pagination logic
  const indexOfLastResult = currentPage * resultsPerPage;
  const indexOfFirstResult = indexOfLastResult - resultsPerPage;
  const currentResults = results.slice(indexOfFirstResult, indexOfLastResult);

  // Change page
  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  // Prepare data for the chart
  const chartData = {
    labels: results.map((result) => new Date(result.timestamp.toDate()).toLocaleDateString()),
    datasets: [
      {
        label: "Score",
        data: results.map((result) => result.score),
        borderColor: "#007bff",
        backgroundColor: "yellow",
        fill: true,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top",
      },
      title: {
        display: true,
        text: "User Improvement Over Time",
      },
    },
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <div className="login-prompt">Please log in to view your results.</div>;
  }

  if (!Array.isArray(results) || results.length === 0) {
    return <div className="no-results">No results found.</div>;
  }

  return (
    <div className="results-page">
      <div className="header-container">
        <img src={logo} alt="NGTC-Versant Logo" className="logo" />
        <h1>NGTC-Versant</h1>
      </div>
      <h1 className="results-title">
        {isAdmin ? "All Users' Quiz Results" : `Results for ${user.displayName || user.email}`}
      </h1>

      {/* Line Chart */}
      <div className="chart-container">
        <Line data={chartData} options={chartOptions} />
      </div>

      <ul className="results-list">
        {currentResults.map((result) => (
          <li key={result.id} className="result-item">
            {isAdmin && <h2>User ID: {result.userId}</h2>}
            <h3>Score: {result.score}/100</h3>
            <p>Date: {result.timestamp.toDate().toLocaleString()}</p>
            <h3>Section Scores:</h3>
            <ul className="section-scores">
              {Object.entries(result.sectionScores).map(([section, score]) => (
                <li key={section}>
                  {section.charAt(0).toUpperCase() + section.slice(1)}: {score}/20
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {/* Pagination */}
      <div className="pagination">
        {Array.from({ length: Math.ceil(results.length / resultsPerPage) }, (_, i) => (
          <button
            key={i + 1}
            onClick={() => paginate(i + 1)}
            className={currentPage === i + 1 ? "active" : ""}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ResultsPage;