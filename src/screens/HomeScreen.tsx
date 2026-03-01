import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type HomeScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Home'
>;

// const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();

  return (
    <View style={styles.container}>
      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Cricket Prediction Image */}
        <View style={styles.imageContainer}>
          {/* Cricket Prediction Image */}
          <Image 
            source={require('../assets/home.png')} 
            style={styles.homeLogo}
            resizeMode="contain"
          />
        </View>
      </View>

      {/* Get Started Button at Bottom */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.getStartedButton}
          onPress={() => navigation.navigate('AllMatches')}
        >
          <Text style={styles.buttonText}>GET STARTED</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  imageContainer: {
    marginBottom: 32,
  },
  homeLogo: {
    width: 320,
    height: 320,
  },
  buttonContainer: {
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  getStartedButton: {
    backgroundColor: '#10b981', // green-500
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 20,
    textAlign: 'center',
  },
});
