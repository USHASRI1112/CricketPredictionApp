import { CricketApiEndpoints } from '../constants/Api';
import { Country } from '../types';

export const fetchCountries = async (): Promise<Country[]> => {
  try {
    const response = await fetch(CricketApiEndpoints.COUNTRIES);
    console.log('Countries API Response:', response);
    return response.ok ? ((await response.json()) as unknown as Country[]) : [];
    // if (!response.ok) {
    //   throw new Error(`API request failed with status ${response.status}`);
    // }
  } catch (error) {
    console.error('Error fetching countries:', error);
    return [];
  }
};
