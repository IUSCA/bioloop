<template>
  <div class="feedback-container">
    <h2 class="title">How satisfied were you with your experience today?</h2>

    <!-- Rating Section -->
    <div class="rating-section">
      <div class="emoji-display">{{ selectedEmoji }}</div>
      <input
        type="range"
        min="1"
        max="5"
        step="0.1"
        v-model="rating"
        @input="updateEmoji"
        class="slider"
      />
      <div class="rating-labels">
        <span>Very Unsatisfied</span>
        <span>Unsatisfied</span>
        <span>Neutral</span>
        <span>Satisfied</span>
        <span>Very Satisfied</span>
      </div>
    </div>

    <!-- Comments Section -->
    <div class="comments-section">
      <label for="comments">Add your comments...</label>
      <textarea id="comments" v-model="comments" rows="4"></textarea>
    </div>

    <!-- Full Name and Email Section -->
    <div class="contact-section">
      <label for="name">Full Name</label>
      <input
        id="name"
        type="text"
        v-model="name"
        placeholder="Enter your full name"
      />

      <label for="email">Email</label>
      <input
        id="email"
        type="email"
        v-model="email"
        placeholder="Enter your email"
      />
    </div>

    <!-- Additional Contact Request -->
    <div class="follow-up-section">
      <p>Could we contact you for additional feedback?</p>
      <button
        :class="{ active: contactAllowed === 'yes' }"
        @click="contactAllowed = 'yes'"
      >
        Yes
      </button>
      <button
        :class="{ active: contactAllowed === 'no' }"
        @click="contactAllowed = 'no'"
      >
        No
      </button>
    </div>

    <!-- Submit Button -->
    <button class="submit-btn" @click="submitFeedback">Submit</button>
  </div>
</template>

<script setup>
import FeedbackService from "@/services/feedback";
import { ref } from "vue";

// Reactive state variables
const rating = ref(3); // Slider default position
const selectedEmoji = ref("🙂");
const comments = ref("");
const name = ref("");
const email = ref("");
const contactAllowed = ref("no");

// Emoji list corresponding to slider value
const emojis = {
  1: "😡", // Very Unsatisfied
  2: "😟", // Unsatisfied
  3: "😐", // Neutral
  4: "😊", // Satisfied
  5: "😃", // Very Satisfied
};

// Update emoji dynamically based on slider position
const updateEmoji = () => {
  const roundedRating = Math.round(rating.value);
  selectedEmoji.value = emojis[roundedRating] || "🙂";
};

// Submit feedback using FeedbackService with Promise chaining
const submitFeedback = () => {
  const feedbackData = {
    rating: Math.round(rating.value),
    comments: comments.value,
    fullName: name.value,
    email: email.value,
  };

  FeedbackService.submitFeedback(feedbackData)
    .then(() => {
      resetForm();
    })
    .catch((error) => {
      console.error("Failed to submit feedback.", error);
    });
};

// Reset form after submission
const resetForm = () => {
  rating.value = 3;
  selectedEmoji.value = "🙂";
  comments.value = "";
  name.value = "";
  email.value = "";
};
</script>

<style scoped>
.feedback-container {
  max-width: 500px;
  margin: 0 auto;
  background: #f9f9f9;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
  font-family: Arial, sans-serif;
}

.title {
  text-align: center;
  font-size: 1.2rem;
  margin-bottom: 20px;
}

.rating-section {
  text-align: center;
  margin-bottom: 20px;
}

.emoji-display {
  font-size: 3rem;
  margin-bottom: 10px;
}

.slider {
  width: 100%;
  margin-bottom: 10px;
}

.rating-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.comments-section {
  margin-bottom: 15px;
}

.comments-section label {
  display: block;
  margin-bottom: 5px;
}

textarea {
  width: 100%;
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 10px;
}

.contact-section label,
.contact-section input {
  display: block;
  width: 100%;
  margin-bottom: 10px;
}

input {
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 8px;
}

.follow-up-section {
  text-align: center;
  margin-bottom: 15px;
}

.follow-up-section button {
  margin: 0 5px;
  padding: 8px 16px;
  border: none;
  border-radius: 5px;
  background-color: #e0e0e0;
  cursor: pointer;
}

.follow-up-section button.active {
  background-color: #4caf50;
  color: white;
}

.submit-btn {
  width: 100%;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 5px;
  padding: 10px;
  font-size: 1rem;
  cursor: pointer;
}

.submit-btn:hover {
  background-color: #45a049;
}
</style>
