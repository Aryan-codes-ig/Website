function showForm() {
    document.getElementById('currency-section').style.display = 'none';
    document.getElementById('form-section').style.display = 'block';
}

function updateCurrencyPlaceholder() {
    const currencyElement = document.getElementById('currency');
    const currency = currencyElement.options[currencyElement.selectedIndex].value;
    document.getElementById('budget').placeholder = `Enter your budget (in ${currency})`;
}

async function loadCostOfLivingData() {
    return new Promise((resolve, reject) => {
        Papa.parse("advisorsmith_cost_of_living_index.csv", {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (result) => resolve(result.data),
            error: (err) => reject(err),
        });
    });
}

async function loadRentData() {
    return new Promise((resolve, reject) => {
        Papa.parse("City_zori_uc_sfrcondomfr_sm_month.csv", {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (result) => resolve(result.data),
            error: (err) => reject(err),
        });
    });
}

function calculateCostOfLiving(index, baseCost) {
    return (index / 100) * baseCost;
}

function getRentData(city, state, rentData) {
    const rentInfo = rentData.find(
        (rent) =>
            rent.RegionName.toLowerCase() === city.toLowerCase() &&
            rent.State.toLowerCase() === state.toLowerCase()
    );

    if (rentInfo) {
        const monthlyRent = parseFloat(rentInfo["2024-10-31"]); // Assuming this is monthly rent
        const annualRent = (monthlyRent * 12).toFixed(2); // Calculate annual rent
        return {
            monthlyRent: monthlyRent.toFixed(2),
            annualRent: annualRent,
        };
    } else {
        return { monthlyRent: "N/A", annualRent: "N/A" };
    }
}

// Toggle details and display chart
function toggleDetailsAndDisplayChart(collegeId) {
    const detailsElement = document.getElementById(`details-${collegeId}`);
    const chartCanvas = document.getElementById(`chart-${collegeId}`);
    const isVisible = detailsElement.style.display === "block";
    detailsElement.style.display = isVisible ? "none" : "block";
    if (!isVisible) {
        const { tuitionConverted, monthlyRent, annualCostOfLiving, annualRent } = JSON.parse(detailsElement.dataset.values);
        new Chart(chartCanvas, {
            type: 'pie',
            data: {
                labels: ['Tuition', 'Annual Rent', 'Annual Cost of Living'],
                datasets: [{
                    data: [tuitionConverted, annualRent, annualCostOfLiving],
                    backgroundColor: ['#1E90FF', '#1C86EE', '#87CEFA'],
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                layout: {
                    padding: {
                        top: 10,
                        bottom: 10,
                        left: 10,
                        right: 10
                    }
                }
            }
        });
    }
}



// Main event listener for form submission
document.getElementById("college-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const major = document.getElementById("major").value.toLowerCase();
    const budget = parseInt(document.getElementById("budget").value, 10);
    const state = document.getElementById("state").value;
    const currency = document.getElementById("currency").value;
    const baseCost = 1874; // Base cost for Augusta, ME

    const apiKey = "zuV41oPAvKHP14aNSJwYg8OhZ3P1kbWdYns3NAjk"; // Fake College Scorecard API key
    const exchangeRateUrl = `https://api.exchangerate-api.com/v4/latest/USD`; // Fake Exchange Rate API
    const collegeUrl = `https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${apiKey}&school.state=${state}&fields=school.name,school.city,latest.cost.tuition.in_state,latest.admissions.admission_rate.overall,latest.programs.cip_4_digit&per_page=100`;

    const resultsContainer = document.getElementById("result");
    resultsContainer.innerHTML = "<p>Loading...</p>";

    try {
        const costOfLivingData = await loadCostOfLivingData();
        const rentData = await loadRentData();
        const exchangeResponse = await fetch(exchangeRateUrl);
        const exchangeData = await exchangeResponse.json();
        const exchangeRate = exchangeData.rates[currency];
        const collegeResponse = await fetch(collegeUrl);
        if (!collegeResponse.ok) {
            throw new Error("Failed to fetch data from the College Scorecard API.");
        }

        const collegeData = await collegeResponse.json();
        resultsContainer.innerHTML = "";

        if (collegeData.results && collegeData.results.length > 0) {
            const filteredColleges = collegeData.results.filter((college) => {
                const tuitionUSD = college["latest.cost.tuition.in_state"];
                const programs = college["latest.programs.cip_4_digit"];
                const acceptanceRate = college["latest.admissions.admission_rate.overall"];
                const city = college["school.city"] || "Unknown City";

                const matchesMajor =
                    programs &&
                    programs.some((program) => {
                        const programTitle = program["title"]
                            ? program["title"].toLowerCase()
                            : "";
                        return programTitle.includes(major);
                    });

                const cityData = costOfLivingData.find(
                    (item) => item.City.toLowerCase() === city.toLowerCase() && item.State.toLowerCase() === state.toLowerCase()
                );

                const { annualRent } = getRentData(city, state, rentData);
                if (cityData && annualRent !== "N/A") {
                    const costOfLivingIndex = parseFloat(cityData["Cost of Living Index"]);
                    const monthlyCostOfLiving = calculateCostOfLiving(costOfLivingIndex, baseCost);
                    const annualCostOfLiving = (monthlyCostOfLiving * 12).toFixed(2);
                    const tuitionConverted = tuitionUSD * exchangeRate;
                    const totalCostConverted = tuitionConverted + parseFloat(annualCostOfLiving) + parseFloat(annualRent);

                    // Ensure totalCostConverted is available in this scope
                    college.totalCostConverted = totalCostConverted;

                    return matchesMajor && acceptanceRate && totalCostConverted <= budget;
                } else {
                    return false;
                }
            });

            filteredColleges.sort((a, b) => {
                return (
                    (a["latest.admissions.admission_rate.overall"] || 1) -
                    (b["latest.admissions.admission_rate.overall"] || 1)
                );
            });

            if (filteredColleges.length > 0) {
                const resultList = document.createElement("ul");

                filteredColleges.forEach((college, index) => {
                    const tuitionUSD = college["latest.cost.tuition.in_state"] || "N/A";
                    const tuitionConverted = (tuitionUSD * exchangeRate).toFixed(2);
                    const acceptanceRate = (
                        college["latest.admissions.admission_rate.overall"] * 100 || "N/A"
                    ).toFixed(2);
                    const name = college["school.name"] || "Unknown School";
                    const city = college["school.city"] || "Unknown City";

                    const cityData = costOfLivingData.find(
                        (item) => item.City.toLowerCase() === city.toLowerCase() && item.State.toLowerCase() === state.toLowerCase()
                    );
                    const costOfLivingIndex = parseFloat(cityData["Cost of Living Index"]);
                    const monthlyCostOfLiving = calculateCostOfLiving(costOfLivingIndex, baseCost).toFixed(2);
                    const annualCostOfLiving = (parseFloat(monthlyCostOfLiving) * 12).toFixed(2);
                    const { monthlyRent, annualRent } = getRentData(city, state, rentData);

                    const listItem = document.createElement("li");
                    listItem.innerHTML = `
                        <h3>${name} (${city})</h3>
                        <p>Total Cost: ${currency} ${college.totalCostConverted.toFixed(2)}</p>
                        <p>Acceptance Rate: ${acceptanceRate}%</p>
                        <button onclick="toggleDetailsAndDisplayChart(${index})">Show Details</button>
                        <div id="details-${index}" class="details" style="display: none;" data-values='${JSON.stringify({
                            tuitionConverted,
                            monthlyRent,
                            annualCostOfLiving,
                            annualRent,
                        })}'>
                            <canvas id="chart-${index}" width="400" height="400"></canvas>
                            <p>Monthly Rent: ${currency} ${monthlyRent}</p>
                            <p>Annual Rent: ${currency} ${annualRent}</p>
                            <p>Monthly Cost of Living: ${currency} ${monthlyCostOfLiving}</p>
                            <p>Annual Cost of Living: ${currency} ${annualCostOfLiving}</p>
                        </div>
                    `;
                    resultList.appendChild(listItem);
                });

                resultsContainer.appendChild(resultList);
            } else {
                resultsContainer.innerHTML =
                    "<p>No colleges found within your budget or matching the selected major.</p>";
            }
        } else {
            resultsContainer.innerHTML = "<p>No results found for the selected state.</p>";
        }
    } catch (error) {
        console.error("Error:", error);
        resultsContainer.innerHTML = "<p>An error occurred while fetching data. Please try again later.</p>";
    }
});
