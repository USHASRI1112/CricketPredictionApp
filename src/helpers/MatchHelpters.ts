  export const getConfidenceColor = (confidence: string) => {
	switch (confidence) {
	  case 'High':
	  case 'Actual':
		return '#10b981';
	  case 'Medium':
		return '#f59e0b';
	  case 'Low':
		return '#ef4444';
	  default:
		return '#6b7280';
	}
  };

  export const getConfidencePercentage = (confidence: string) => {
	switch (confidence) {
	  case 'Actual':
		return '100%';
	  case 'High':
		return '75-90%';
	  case 'Medium':
		return '50-74%';
	  case 'Low':
		return '30-49%';
	  default:
		return 'N/A';
	}
  };