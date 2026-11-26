/**
 * NeuroData Studio - Built-in Academic & Benchmark Datasets
 * High quality synthetic datasets with realistic statistical properties and intentional patterns/anomalies.
 */

const PRELOADED_DATASETS = {
  students: {
    id: 'students',
    name: '🎓 Student Academic Performance & Exam Success',
    description: 'B.Tech academic dataset analyzing the impact of study habits, sleep, and attendance on final performance.',
    recommendedTarget: 'Final_Exam_Score',
    recommendedFeatures: ['Study_Hours_Week', 'Attendance_Pct'],
    generate: function() {
      const rows = [];
      const modes = ['In-Person', 'Hybrid', 'Online'];
      for (let i = 1; i <= 100; i++) {
        const study = +(10 + Math.random() * 30).toFixed(1); // 10 - 40 hrs
        const attendance = +(65 + Math.random() * 34).toFixed(1); // 65 - 99%
        const sleep = +(5.0 + Math.random() * 4.0).toFixed(1); // 5 - 9 hrs
        const prevScore = +(45 + Math.random() * 50).toFixed(1); // 45 - 95
        const extraHours = +(2 + Math.random() * 12).toFixed(1);
        const mode = modes[Math.floor(Math.random() * modes.length)];

        // Target with realistic noise and deliberate anomalies
        let finalScore = +(20 + (study * 1.15) + (attendance * 0.35) + (prevScore * 0.25) + (sleep * 1.2) + (Math.random() * 8 - 4)).toFixed(1);
        
        // Outliers
        if (i === 14) finalScore = 98.5; // low study genius anomaly
        if (i === 52) finalScore = 41.2; // high study burnout anomaly
        finalScore = Math.min(100, Math.max(30, finalScore));

        let status = 'Pass';
        if (finalScore >= 85) status = 'Distinction';
        else if (finalScore < 50) status = 'At Risk';

        rows.push({
          Student_ID: `STU-${1000 + i}`,
          Study_Hours_Week: study,
          Attendance_Pct: attendance,
          Sleep_Hours: sleep,
          Previous_Score: prevScore,
          Extra_Curricular_Hours: extraHours,
          Study_Mode: mode,
          Final_Exam_Score: finalScore,
          Academic_Status: status
        });
      }
      return rows;
    }
  },

  customers: {
    id: 'customers',
    name: '🛍️ E-Commerce Customer Segmentation & LTV',
    description: 'Behavioral analytics dataset ideal for K-Means Clustering on Income vs Spending Score.',
    recommendedTarget: 'Spending_Score',
    recommendedFeatures: ['Annual_Income_k', 'Spending_Score'],
    generate: function() {
      const rows = [];
      const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum'];
      // 5 distinct clusters for K-Means demonstration:
      // 1: Low Income, Low Spending (Careful)
      // 2: Low Income, High Spending (Careless)
      // 3: Medium Income, Medium Spending (Standard)
      // 4: High Income, Low Spending (Frugal/Conservative)
      // 5: High Income, High Spending (VIP/Target)
      const clusterDefs = [
        { count: 20, incMin: 15, incMax: 35, spendMin: 8, spendMax: 38 },
        { count: 20, incMin: 15, incMax: 38, spendMin: 65, spendMax: 96 },
        { count: 25, incMin: 42, incMax: 70, spendMin: 40, spendMax: 65 },
        { count: 18, incMin: 75, incMax: 125, spendMin: 10, spendMax: 36 },
        { count: 17, incMin: 80, incMax: 135, spendMin: 72, spendMax: 98 }
      ];

      let id = 1;
      clusterDefs.forEach((def, cIdx) => {
        for (let j = 0; j < def.count; j++) {
          const age = Math.floor(19 + Math.random() * 50);
          const income = Math.floor(def.incMin + Math.random() * (def.incMax - def.incMin));
          const spend = Math.floor(def.spendMin + Math.random() * (def.spendMax - def.spendMin));
          const orders = Math.floor(2 + (spend / 10) + Math.random() * 5);
          const satisfaction = +(3.2 + Math.random() * 1.8).toFixed(1);
          
          let tier = tiers[0];
          if (income > 80 && spend > 70) tier = tiers[3];
          else if (spend > 60 || income > 60) tier = tiers[2];
          else if (spend > 35) tier = tiers[1];

          rows.push({
            Customer_ID: `CUST-${2000 + id++}`,
            Age: age,
            Annual_Income_k: income,
            Spending_Score: spend,
            Annual_Orders: orders,
            Satisfaction_Score: satisfaction,
            Loyalty_Tier: tier
          });
        }
      });
      return rows;
    }
  },

  realestate: {
    id: 'realestate',
    name: '🏡 Urban Real Estate & Property Valuation',
    description: 'Property pricing analysis across metropolitan locations, square footage, and amenities.',
    recommendedTarget: 'Price_k_USD',
    recommendedFeatures: ['Area_SqFt', 'Price_k_USD'],
    generate: function() {
      const rows = [];
      const types = ['Apartment', 'Condo', 'Townhouse', 'Luxury Villa'];
      for (let i = 1; i <= 100; i++) {
        const area = Math.floor(650 + Math.random() * 2800);
        const bedrooms = Math.min(5, Math.max(1, Math.floor(area / 600)));
        const bathrooms = Math.max(1, Math.floor(bedrooms * 0.75 + Math.random()));
        const age = Math.floor(1 + Math.random() * 25);
        const metroDist = +(0.5 + Math.random() * 14.5).toFixed(1);
        const pType = types[Math.floor(Math.random() * types.length)];

        // Base price calculation with market factors
        let price = Math.floor(
          80 + 
          (area * 0.16) + 
          (bedrooms * 22) + 
          (bathrooms * 15) - 
          (age * 2.1) - 
          (metroDist * 5.4) + 
          (Math.random() * 40 - 20)
        );

        // Anomaly
        if (i === 22) price = 950; // Penthouse anomaly
        if (i === 77) price = 110; // Distressed sale anomaly
        price = Math.max(75, price);

        rows.push({
          Property_ID: `PROP-${3000 + i}`,
          Area_SqFt: area,
          Bedrooms: bedrooms,
          Bathrooms: bathrooms,
          Property_Age_Years: age,
          Metro_Distance_Km: metroDist,
          Property_Type: pType,
          Price_k_USD: price
        });
      }
      return rows;
    }
  },

  iot_sensors: {
    id: 'iot_sensors',
    name: '⚡ Server Telemetry & Industrial Sensor Monitoring',
    description: 'Time-series sensor telemetry for thermal load, CPU spikes, and anomaly detection.',
    recommendedTarget: 'CPU_Load_Pct',
    recommendedFeatures: ['Temperature_C', 'CPU_Load_Pct'],
    generate: function() {
      const rows = [];
      const statuses = ['Nominal', 'Elevated', 'Critical'];
      let baseTemp = 48.0;
      for (let i = 1; i <= 100; i++) {
        const timeIndex = i;
        const cpu = +(25 + Math.sin(i / 6) * 18 + Math.random() * 25).toFixed(1);
        const memory = +(40 + (i * 0.3) % 45 + Math.random() * 10).toFixed(1);
        let temp = +(baseTemp + (cpu * 0.32) + Math.random() * 4 - 2).toFixed(1);
        const netThroughput = +(15 + Math.random() * 80).toFixed(1);

        // Inject deliberate thermal & load anomalies
        let status = 'Nominal';
        if (i === 33 || i === 78) {
          temp = 94.6; // Thermal spike
          status = 'Critical';
        } else if (i === 60) {
          temp = 89.2;
          status = 'Critical';
        } else if (temp > 70 || cpu > 75) {
          status = 'Elevated';
        }

        rows.push({
          Timestamp_Seq: `T-${String(timeIndex).padStart(3, '0')}`,
          CPU_Load_Pct: Math.min(100, Math.max(5, cpu)),
          Memory_Usage_Pct: Math.min(100, memory),
          Temperature_C: temp,
          Network_MBps: netThroughput,
          System_Status: status
        });
      }
      return rows;
    }
  },

  sales_retail: {
    id: 'sales_retail',
    name: '💼 Enterprise Retail Sales & Revenue Analytics',
    description: 'Omnichannel commerce dataset with products, categories, revenue, regional distribution, and time series.',
    recommendedTarget: 'Revenue',
    recommendedFeatures: ['Quantity', 'Revenue'],
    generate: function() {
      const rows = [];
      const products = [
        { name: 'NeuroChip X1', cat: 'Hardware', price: 1500 },
        { name: 'Quantum GPU Pro', cat: 'Hardware', price: 2200 },
        { name: 'Edge Sensor Hub', cat: 'Sensors', price: 450 },
        { name: 'BioPulse Smartwatch', cat: 'Wearables', price: 280 },
        { name: 'Cloud Stream Gateway', cat: 'Cloud Tech', price: 890 },
        { name: 'Optic Fiber Node', cat: 'Networking', price: 620 }
      ];
      const regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America'];
      const baseDate = new Date(2025, 0, 1);

      for (let i = 1; i <= 100; i++) {
        const prod = products[Math.floor(Math.random() * products.length)];
        const reg = regions[Math.floor(Math.random() * regions.length)];
        const qty = Math.floor(1 + Math.random() * 18);
        const revenue = +(qty * prod.price).toFixed(2);
        const age = Math.floor(22 + Math.random() * 45);
        const d = new Date(baseDate.getTime() + (i * 24 * 3600 * 1000 * 1.5));
        const dateStr = d.toISOString().split('T')[0];

        let churnRisk = 'Low';
        if (qty <= 2 && age > 45) churnRisk = 'High';
        else if (qty <= 5) churnRisk = 'Medium';

        rows.push({
          Order_ID: `ORD-${5000 + i}`,
          Date: dateStr,
          Product: prod.name,
          Category: prod.cat,
          Region: reg,
          Quantity: qty,
          Unit_Price: prod.price,
          Revenue: revenue,
          Customer_Age: age,
          Churn_Risk: churnRisk
        });
      }
      return rows;
    }
  }
};

